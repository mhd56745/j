const express = require('express');
const db = require('../database');
const { authMiddleware } = require('./auth');

const router = express.Router();

// M3U endpoint can be public (for player access)
router.get('/', (req, res) => {
  try {
    const settings = db.getSettings();
    const serverUrl = settings.server_url || 'http://YOUR_SERVER_IP:3000';

    const channels = db.getChannels({});
    const allStreams = db.getStreams({ status: 'active' });

    // Group streams by channel
    const streamMap = {};
    for (const s of allStreams) {
      if (!streamMap[s.channel_id]) streamMap[s.channel_id] = [];
      streamMap[s.channel_id].push(s);
    }

    let m3u = '#EXTM3U\n';
    m3u += `# IPTV Restreaming Server - Playlist\n`;
    m3u += `# Generated: ${new Date().toISOString()}\n`;
    m3u += `# Server: ${serverUrl}\n\n`;

    for (const channel of channels) {
      const streams = streamMap[channel.id];
      if (!streams || streams.length === 0) continue;

      const stream = streams[0];
      const url = `${serverUrl}${stream.proxy_path || `/live/${stream.id}`}`;

      m3u += `#EXTINF:-1 tvg-id="${channel.epg_id || ''}" tvg-name="${channel.name}"`;
      if (channel.category_name) m3u += ` group-title="${channel.category_name}"`;
      if (channel.logo_url) m3u += ` tvg-logo="${channel.logo_url}"`;
      m3u += `,${channel.name}\n`;
      m3u += `${url}\n\n`;
    }

    db.log('m3u_exported', `M3U playlist exported`, 'info');
    res.set('Content-Type', 'application/x-mpegurl');
    res.set('Content-Disposition', 'attachment; filename="iptv_playlist.m3u"');
    res.send(m3u);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;