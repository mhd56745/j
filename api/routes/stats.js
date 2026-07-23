const express = require('express');
const db = require('../database');
const { authMiddleware } = require('./auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  try {
    res.json(db.getDashboardStats());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;