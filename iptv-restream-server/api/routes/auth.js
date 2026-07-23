// Auth Routes
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../database');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const user = db.authenticateUser(username, password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const settings = db.getSettings();
  const secret = settings.jwt_secret || 'fallback-secret-change-me';
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    secret,
    { expiresIn: '24h' }
  );

  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role },
  });
});

router.post('/change-password', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  try {
    const settings = db.getSettings();
    const secret = settings.jwt_secret || 'fallback-secret-change-me';
    const decoded = jwt.verify(authHeader.replace('Bearer ', ''), secret);
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });

    const user = db.authenticateUser(decoded.username, currentPassword);
    if (!user) return res.status(401).json({ error: 'Current password incorrect' });

    const bcrypt = require('bcryptjs');
    const newHash = bcrypt.hashSync(newPassword, 10);
    db.getDb().prepare('UPDATE users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newHash, user.id);
    db.log('password_changed', `Password changed for ${user.username}`, 'warning');

    res.json({ success: true });
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  try {
    const settings = db.getSettings();
    const secret = settings.jwt_secret || 'fallback-secret-change-me';
    const decoded = jwt.verify(authHeader.replace('Bearer ', ''), secret);
    const user = db.getUser(decoded.username);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Middleware
function authMiddleware(req, res, next) {
  const settings = db.getSettings();
  if (settings.auth_enabled === 'false') return next();

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  try {
    const secret = settings.jwt_secret || 'fallback-secret-change-me';
    jwt.verify(authHeader.replace('Bearer ', ''), secret);
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = router;
module.exports.authMiddleware = authMiddleware;