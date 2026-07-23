const express = require('express');
const db = require('../database');
const { authMiddleware } = require('./auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  try {
    res.json(db.getCategories());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { name, logoUrl } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name required' });
    const id = db.createCategory({ name, logo_url: logoUrl });
    res.status(201).json({ id, success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    db.updateCategory(req.params.id, req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    db.deleteCategory(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;