const express = require('express');
const db = require('../database');
const { authMiddleware } = require('./auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    res.json(db.getLogs(limit));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/', (req, res) => {
  try {
    db.clearLogs();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;