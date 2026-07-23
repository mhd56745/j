const express = require('express');
const db = require('../database');

const router = express.Router();

// ---- Helper: get server base URL from request (works behind Koyeb proxy) ----
function getServerUrl(req) {
  const settings = db.getSettings();
  const saved = settings.server_url;
  // Use saved URL only if it's a real URL (not empty, not placeholder)
  if (saved && !saved.includes('YOUR_SERVER_IP') && !saved.includes('localhost')) {
    return saved.replace(/\/+$/, '');
  }
  // Auto-detect from request headers (Koyeb sets X-Forwarded-* headers)
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${proto}://${host}`;
}

// M3U endpoint is public (for player access)
router.get('/', (req, res) => {
  try {
    const serverUrl = getServerUrl(req);

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
      const url = `${serverUrl}/live/${stream.id}`;

      m3u += `#EXTINF:-1 tvg-id="${channel.epg_id || ''}" tvg-name="${channel.name}"`;
      if (channel.category_name) m3u += ` group-title="${channel.category_name}"`;
      if (channel.logo_url) m3u += ` tvg-logo="${channel.logo_url}"`;
      m3u += `,${channel.name}\n`;
      m3u += `${url}\n\n`;
    }

    db.log('m3u_exported', `M3U playlist exported`, 'info');
    res.set('Content-Type', 'application/x-mpegurl');
    res.set('Content-Disposition', 'attachment; filename="iptv_playlist.m3u"');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(m3u);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
