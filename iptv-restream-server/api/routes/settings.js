const express = require('express');
const db = require('../database');
const { authMiddleware } = require('./auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  try {
    res.json(db.getSettings());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', (req, res) => {
  try {
    db.updateSettings(req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;