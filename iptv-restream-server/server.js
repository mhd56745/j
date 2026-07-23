// ============================================================
// IPTV Restreaming Server - Main Entry Point
// Optimized for Low VPS / Koyeb Deployment
// ============================================================

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

const db = require('./api/database');
const authRoutes = require('./api/routes/auth');
const streamRoutes = require('./api/routes/streams');
const channelRoutes = require('./api/routes/channels');
const categoryRoutes = require('./api/routes/categories');
const settingsRoutes = require('./api/routes/settings');
const nginxRoutes = require('./api/routes/nginx-config');
const m3uRoutes = require('./api/routes/m3u');
const logsRoutes = require('./api/routes/logs');
const statsRoutes = require('./api/routes/stats');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Security & Performance for Low VPS ----
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(compression({ level: 6, threshold: 1024 }));
app.use(morgan('combined', { stream: fs.createWriteStream('/dev/null', { flags: 'a' }) }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ---- Rate Limiting (in-memory for zero deps) ----
const rateLimitMap = new Map();
app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  const windowMs = 60000;
  const maxRequests = 120;

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, []);
  }

  const requests = rateLimitMap.get(ip).filter(t => now - t < windowMs);
  requests.push(now);
  rateLimitMap.set(ip, requests);

  if (requests.length > maxRequests) {
    return res.status(429).json({ error: 'Too many requests. Slow down.' });
  }

  // Cleanup old entries every 5 minutes
  if (Math.random() < 0.01) {
    const cutoff = now - windowMs;
    for (const [key, times] of rateLimitMap) {
      const filtered = times.filter(t => t > cutoff);
      if (filtered.length === 0) rateLimitMap.delete(key);
      else rateLimitMap.set(key, filtered);
    }
  }

  next();
});

// ---- Initialize Database ----
db.init();

// ---- API Routes ----
app.use('/api/auth', authRoutes);
app.use('/api/streams', streamRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/nginx-config', nginxRoutes);
app.use('/api/m3u', m3uRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/stats', statsRoutes);

// ---- Health Check ----
app.get('/api/health', (req, res) => {
  const memUsage = process.memoryUsage();
  const uptime = process.uptime();
  res.json({
    status: 'ok',
    uptime: Math.floor(uptime),
    memory: {
      rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
    },
    streams: db.getStreamCount(),
  });
});

// ---- Serve Admin Panel ----
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// ---- Fallback: Serve admin panel for all non-API routes ----
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
  } else {
    res.status(404).json({ error: 'API endpoint not found' });
  }
});

// ---- Start Server ----
const server = http.createServer(app);

// ---- WebSocket for Real-time Stream Status ----
const WebSocket = require('ws');
const wss = new WebSocket.Server({ server, path: '/ws' });

const clients = new Set();
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
  // Send current status on connect
  ws.send(JSON.stringify({ type: 'connected', streams: db.getActiveStreams() }));
});

// Broadcast function for real-time updates
app.locals.broadcast = (event, data) => {
  const msg = JSON.stringify({ type: event, ...data });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
};

// ---- Start Health Checker (every 60s) ----
const cron = require('node-cron');
const axios = require('axios');

function checkStreamHealth() {
  const streams = db.getStreamsForHealthCheck();
  const results = [];

  for (const stream of streams) {
    const start = Date.now();
    axios.head(stream.source_url, {
      timeout: 10000,
      validateStatus: () => true,
      maxRedirects: 5,
    }).then(res => {
      const ms = Date.now() - start;
      const status = res.status < 400 ? 'active' : 'error';
      db.updateStreamHealth(stream.id, status, ms);
      results.push({ id: stream.id, name: stream.name, status, ms });

      if (results.length === streams.length) {
        app.locals.broadcast('health_check', { results, timestamp: new Date().toISOString() });
      }
    }).catch(() => {
      const ms = Date.now() - start;
      db.updateStreamHealth(stream.id, 'error', ms);
      results.push({ id: stream.id, name: stream.name, status: 'error', ms });
      if (results.length === streams.length) {
        app.locals.broadcast('health_check', { results, timestamp: new Date().toISOString() });
      }
    });
  }
}

// Run health check every 60 seconds
cron.schedule('* * * * *', checkStreamHealth);
// Run first check after 5 seconds
setTimeout(checkStreamHealth, 5000);

// ---- Graceful Shutdown ----
process.on('SIGTERM', () => {
  console.log('[SERVER] SIGTERM received, shutting down...');
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  console.log('[SERVER] SIGINT received, shutting down...');
  server.close(() => process.exit(0));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ╔═══════════════════════════════════════════════════════╗
  ║   IPTV Restreaming Server v2.0                        ║
  ║   Admin Panel: http://0.0.0.0:${PORT}/admin            ║
  ║   API:         http://0.0.0.0:${PORT}/api              ║
  ║   Health:      http://0.0.0.0:${PORT}/api/health       ║
  ║   WebSocket:   ws://0.0.0.0:${PORT}/ws                ║
  ╚═══════════════════════════════════════════════════════╝
  `);
});