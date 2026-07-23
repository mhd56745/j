const express = require('express');
const db = require('../database');
const { authMiddleware } = require('./auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  try {
    const { status, channel_id, search, page = '1', limit = '20' } = req.query;
    const filters = {
      status: status || 'all',
      channel_id: channel_id || null,
      search: search || null,
      page: parseInt(page),
      limit: parseInt(limit),
    };
    const streams = db.getStreams(filters);
    const total = db.getStreamCount(filters);
    res.json({ streams, total, page: filters.page, limit: filters.limit });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { name, channelId, sourceUrl, streamType, quality, maxBitrate, cpuLimit, memoLimit, proxyPath, healthCheck } = req.body;
    if (!name || !channelId || !sourceUrl) return res.status(400).json({ error: 'Name, channelId, and sourceUrl are required' });

    const stream = db.createStream({
      name, channel_id: channelId, source_url: sourceUrl,
      stream_type: streamType, quality, max_bitrate: maxBitrate,
      cpu_limit: cpuLimit, memo_limit: memoLimit, proxy_path: proxyPath,
      health_check: healthCheck,
    });

    // Broadcast real-time update
    if (req.app.locals.broadcast) {
      req.app.locals.broadcast('stream_added', { stream });
    }

    res.status(201).json(stream);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const stream = db.updateStream(req.params.id, req.body);
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    res.json(stream);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    db.deleteStream(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/', (req, res) => {
  try {
    const { ids } = req.query;
    if (!ids) return res.status(400).json({ error: 'No IDs provided' });
    db.deleteStreams(ids.split(','));
    res.json({ deleted: ids.split(',').length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;