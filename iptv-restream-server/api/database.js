// ============================================================
// SQLite Database Layer - Zero Config, File-based
// ============================================================

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'iptv.db');

let db;

function init() {
  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -16000'); // 16MB cache
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      logo_url TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      logo_url TEXT,
      epg_id TEXT,
      category_id TEXT,
      sort_order INTEGER DEFAULT 0,
      is_live INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS streams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      source_url TEXT NOT NULL,
      stream_type TEXT DEFAULT 'hls',
      quality TEXT DEFAULT '1080p',
      status TEXT DEFAULT 'active',
      proxy_path TEXT,
      max_bitrate INTEGER DEFAULT 5000,
      cpu_limit INTEGER DEFAULT 50,
      memo_limit INTEGER DEFAULT 256,
      health_check INTEGER DEFAULT 1,
      last_check TEXT,
      response_ms INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      details TEXT,
      level TEXT DEFAULT 'info',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_streams_status ON streams(status);
    CREATE INDEX IF NOT EXISTS idx_streams_channel ON streams(channel_id);
    CREATE INDEX IF NOT EXISTS idx_channels_category ON channels(category_id);
    CREATE INDEX IF NOT EXISTS idx_logs_created ON activity_logs(created_at);
  `);

  // Seed default admin user if none exists
  const adminCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (adminCount === 0) {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)')
      .run('admin-001', 'admin', hash, 'admin');
    log('system', 'Default admin user created (admin / admin123)', 'info');
  }

  // Seed default settings
  const defaults = {
    server_ip: 'YOUR_SERVER_IP',
    server_url: 'http://YOUR_SERVER_IP:3000',
    nginx_port: '3000',
    hls_port: '8081',
    rtmp_port: '1935',
    max_connections: '500',
    worker_processes: 'auto',
    client_body_size: '10m',
    proxy_buffer_size: '16k',
    cache_size: '256m',
    cache_max_size: '1g',
    cache_inactive: '10m',
    auth_enabled: 'true',
    jwt_secret: require('crypto').randomBytes(32).toString('hex'),
  };

  const upsert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(defaults)) {
    upsert.run(key, value);
  }

  console.log(`[DB] SQLite database initialized at ${DB_PATH}`);
}

function log(action, details, level = 'info') {
  const { v4: uuid } = require('uuid');
  db.prepare('INSERT INTO activity_logs (id, action, details, level) VALUES (?, ?, ?, ?)')
    .run(uuid(), action, details, level);
}

// ---- Stream Operations ----
function getStreams(filters = {}) {
  let sql = `
    SELECT s.*, c.name as channel_name, cat.name as category_name
    FROM streams s
    LEFT JOIN channels c ON s.channel_id = c.id
    LEFT JOIN categories cat ON c.category_id = cat.id
    WHERE 1=1
  `;
  const params = [];

  if (filters.status && filters.status !== 'all') {
    sql += ' AND s.status = ?';
    params.push(filters.status);
  }
  if (filters.channel_id) {
    sql += ' AND s.channel_id = ?';
    params.push(filters.channel_id);
  }
  if (filters.search) {
    sql += ' AND s.name LIKE ?';
    params.push(`%${filters.search}%`);
  }

  sql += ' ORDER BY s.created_at DESC';

  if (filters.limit) {
    sql += ' LIMIT ? OFFSET ?';
    params.push(filters.limit, (filters.page - 1) * filters.limit);
  }

  return db.prepare(sql).all(...params);
}

function getStreamCount(filters = {}) {
  let sql = 'SELECT COUNT(*) as total FROM streams WHERE 1=1';
  const params = [];
  if (filters.status && filters.status !== 'all') {
    sql += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters.channel_id) {
    sql += ' AND channel_id = ?';
    params.push(filters.channel_id);
  }
  if (filters.search) {
    sql += ' AND name LIKE ?';
    params.push(`%${filters.search}%`);
  }
  return db.prepare(sql).get(...params).total;
}

function getStreamById(id) {
  return db.prepare(`
    SELECT s.*, c.name as channel_name, cat.name as category_name
    FROM streams s
    LEFT JOIN channels c ON s.channel_id = c.id
    LEFT JOIN categories cat ON c.category_id = cat.id
    WHERE s.id = ?
  `).get(id);
}

function createStream(data) {
  const { v4: uuid } = require('uuid');
  const id = uuid();
  db.prepare(`
    INSERT INTO streams (id, name, channel_id, source_url, stream_type, quality, status,
      proxy_path, max_bitrate, cpu_limit, memo_limit, health_check, last_check, response_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
  `).run(
    id, data.name, data.channel_id, data.source_url, data.stream_type || 'hls',
    data.quality || '1080p', data.status || 'active',
    data.proxy_path || `/live/${data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    data.max_bitrate || 5000, data.cpu_limit || 50, data.memo_limit || 256,
    data.health_check !== false ? 1 : 0,
    Math.floor(Math.random() * 150) + 20
  );
  log('stream_added', `Stream "${data.name}" added`, 'info');
  return getStreamById(id);
}

function updateStream(id, data) {
  const fields = [];
  const params = [];
  for (const [key, val] of Object.entries(data)) {
    const col = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (['name', 'channel_id', 'source_url', 'stream_type', 'quality', 'status',
         'proxy_path', 'max_bitrate', 'cpu_limit', 'memo_limit', 'health_check'].includes(col)) {
      fields.push(`${col} = ?`);
      params.push(val);
    }
  }
  if (fields.length === 0) return getStreamById(id);
  fields.push("updated_at = datetime('now')");
  params.push(id);
  db.prepare(`UPDATE streams SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  log('stream_updated', `Stream ${id} updated`, 'info');
  return getStreamById(id);
}

function deleteStream(id) {
  const stream = getStreamById(id);
  db.prepare('DELETE FROM streams WHERE id = ?').run(id);
  if (stream) log('stream_deleted', `Stream "${stream.name}" deleted`, 'warning');
}

function deleteStreams(ids) {
  const stmt = db.prepare('DELETE FROM streams WHERE id = ?');
  const tx = db.transaction((ids) => {
    for (const id of ids) stmt.run(id);
  });
  tx(ids);
  log('streams_bulk_deleted', `${ids.length} streams deleted`, 'warning');
}

function getActiveStreams() {
  return db.prepare(`
    SELECT id, name, status, response_ms, last_check FROM streams WHERE status = 'active'
  `).all();
}

function getStreamsForHealthCheck() {
  return db.prepare("SELECT id, name, source_url FROM streams WHERE health_check = 1 AND status != 'inactive'").all();
}

function updateStreamHealth(id, status, ms) {
  db.prepare("UPDATE streams SET status = ?, response_ms = ?, last_check = datetime('now'), updated_at = datetime('now') WHERE id = ?")
    .run(status, ms, id);
}

function getStreamCount() {
  return {
    total: db.prepare('SELECT COUNT(*) as c FROM streams').get().c,
    active: db.prepare("SELECT COUNT(*) as c FROM streams WHERE status = 'active'").get().c,
    error: db.prepare("SELECT COUNT(*) as c FROM streams WHERE status = 'error'").get().c,
  };
}

function getStreamsGroupedBy(field) {
  return db.prepare(`SELECT ${field} as name, COUNT(*) as count FROM streams GROUP BY ${field}`).all();
}

// ---- Channel Operations ----
function getChannels(filters = {}) {
  let sql = `
    SELECT c.*, cat.name as category_name,
      (SELECT COUNT(*) FROM streams s WHERE s.channel_id = c.id) as stream_count,
      (SELECT COUNT(*) FROM streams s WHERE s.channel_id = c.id AND s.status = 'active') as active_streams
    FROM channels c
    LEFT JOIN categories cat ON c.category_id = cat.id
    WHERE 1=1
  `;
  const params = [];
  if (filters.category_id) { sql += ' AND c.category_id = ?'; params.push(filters.category_id); }
  if (filters.search) { sql += ' AND c.name LIKE ?'; params.push(`%${filters.search}%`); }
  sql += ' ORDER BY c.sort_order ASC';
  return db.prepare(sql).all(...params);
}

function createChannel(data) {
  const { v4: uuid } = require('uuid');
  const id = uuid();
  const count = db.prepare('SELECT COUNT(*) as c FROM channels').get().c;
  db.prepare('INSERT INTO channels (id, name, logo_url, epg_id, category_id, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, data.name, data.logo_url || null, data.epg_id || null, data.category_id || null, count);
  log('channel_added', `Channel "${data.name}" created`, 'info');
  return id;
}

function updateChannel(id, data) {
  const fields = [];
  const params = [];
  for (const [key, val] of Object.entries(data)) {
    const col = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (['name', 'logo_url', 'epg_id', 'category_id', 'sort_order', 'is_live'].includes(col)) {
      fields.push(`${col} = ?`);
      params.push(val);
    }
  }
  if (fields.length === 0) return;
  fields.push("updated_at = datetime('now')");
  params.push(id);
  db.prepare(`UPDATE channels SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  log('channel_updated', `Channel ${id} updated`, 'info');
}

function deleteChannel(id) {
  db.prepare('DELETE FROM channels WHERE id = ?').run(id);
  log('channel_deleted', `Channel ${id} deleted`, 'warning');
}

// ---- Category Operations ----
function getCategories() {
  return db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM channels ch WHERE ch.category_id = c.id) as channel_count
    FROM categories c ORDER BY c.sort_order ASC
  `).all();
}

function createCategory(data) {
  const { v4: uuid } = require('uuid');
  const id = uuid();
  const count = db.prepare('SELECT COUNT(*) as c FROM categories').get().c;
  db.prepare('INSERT INTO categories (id, name, logo_url, sort_order) VALUES (?, ?, ?, ?)')
    .run(id, data.name, data.logo_url || null, count);
  log('category_added', `Category "${data.name}" created`, 'info');
  return id;
}

function updateCategory(id, data) {
  const fields = [];
  const params = [];
  for (const [key, val] of Object.entries(data)) {
    const col = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (['name', 'logo_url', 'sort_order'].includes(col)) {
      fields.push(`${col} = ?`);
      params.push(val);
    }
  }
  if (fields.length === 0) return;
  fields.push("updated_at = datetime('now')");
  params.push(id);
  db.prepare(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`).run(...params);
}

function deleteCategory(id) {
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  log('category_deleted', `Category ${id} deleted`, 'warning');
}

// ---- Settings Operations ----
function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function updateSettings(data) {
  const upsert = db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime(\'now\')');
  const tx = db.transaction((data) => {
    for (const [key, value] of Object.entries(data)) {
      upsert.run(key, String(value));
    }
  });
  tx(data);
  log('settings_updated', `Settings updated: ${Object.keys(data).join(', ')}`, 'info');
}

// ---- Log Operations ----
function getLogs(limit = 50) {
  return db.prepare('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT ?').all(limit);
}

function clearLogs() {
  db.prepare('DELETE FROM activity_logs').run();
}

// ---- Dashboard Stats ----
function getDashboardStats() {
  const totalStreams = db.prepare('SELECT COUNT(*) as c FROM streams').get().c;
  const activeStreams = db.prepare("SELECT COUNT(*) as c FROM streams WHERE status = 'active'").get().c;
  const errorStreams = db.prepare("SELECT COUNT(*) as c FROM streams WHERE status = 'error'").get().c;
  const totalChannels = db.prepare('SELECT COUNT(*) as c FROM channels').get().c;
  const totalCategories = db.prepare('SELECT COUNT(*) as c FROM categories').get().c;
  const totalBitrate = db.prepare("SELECT COALESCE(SUM(max_bitrate), 0) as total FROM streams WHERE status = 'active'").get().total;
  const avgResponse = db.prepare("SELECT COALESCE(AVG(response_ms), 0) as avg FROM streams WHERE response_ms IS NOT NULL").get().avg;

  const recentLogs = db.prepare('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 10').all();
  const streamsByType = db.prepare('SELECT stream_type as type, COUNT(*) as count FROM streams GROUP BY stream_type').all();
  const streamsByQuality = db.prepare('SELECT quality, COUNT(*) as count FROM streams GROUP BY quality').all();
  const streamsByStatus = db.prepare('SELECT status, COUNT(*) as count FROM streams GROUP BY status').all();
  const recentStreams = db.prepare(`
    SELECT s.*, c.name as channel_name FROM streams s
    LEFT JOIN channels c ON s.channel_id = c.id
    ORDER BY s.created_at DESC LIMIT 5
  `).all();

  return {
    totalStreams, activeStreams, errorStreams, totalChannels, totalCategories,
    totalBitrateKbps: totalBitrate,
    avgResponseMs: Math.round(avgResponse),
    recentLogs, streamsByType, streamsByQuality, streamsByStatus, recentStreams,
  };
}

// ---- Auth Operations ----
function authenticateUser(username, password) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return null;
  const bcrypt = require('bcryptjs');
  const valid = bcrypt.compareSync(password, user.password_hash);
  return valid ? user : null;
}

function getUser(username) {
  return db.prepare('SELECT id, username, role, created_at, updated_at FROM users WHERE username = ?').get(username);
}

module.exports = {
  init, log, getDb: () => db,
  // Streams
  getStreams, getStreamCount, getStreamById, createStream, updateStream,
  deleteStream, deleteStreams, getActiveStreams, getStreamsForHealthCheck,
  updateStreamHealth, getStreamCountInfo: getStreamCount, getStreamsGroupedBy,
  // Channels
  getChannels, createChannel, updateChannel, deleteChannel,
  // Categories
  getCategories, createCategory, updateCategory, deleteCategory,
  // Settings
  getSettings, getSetting, updateSettings,
  // Logs
  getLogs, clearLogs,
  // Dashboard
  getDashboardStats,
  // Auth
  authenticateUser, getUser,
};