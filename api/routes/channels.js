const express = require('express');
const db = require('../database');
const { authMiddleware } = require('./auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  try {
    const { category_id, search } = req.query;
    const channels = db.getChannels({ category_id, search });
    res.json(channels);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { name, logoUrl, epgId, categoryId } = req.body;
    if (!name) return res.status(400).json({ error: 'Channel name required' });
    const id = db.createChannel({ name, logo_url: logoUrl, epg_id: epgId, category_id: categoryId });
    res.status(201).json({ id, success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    db.updateChannel(req.params.id, req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    db.deleteChannel(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;