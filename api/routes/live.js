// ============================================================
// Live Stream Proxy - Core Restreaming Endpoint
// Proxies /live/:id requests to the actual source URL
// ============================================================

const express = require('express');
const db = require('../database');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const router = express.Router();

// Active proxy connections tracking (for connection limiting)
const activeConnections = new Map();

// ---- Helper: get server base URL from request (works behind Koyeb proxy) ----
function getServerUrl(req) {
  const settings = db.getSettings();
  const saved = settings.server_url;
  // If saved URL still has placeholder, ignore it
  if (saved && !saved.includes('YOUR_SERVER_IP') && !saved.includes('localhost')) {
    return saved.replace(/\/+$/, '');
  }
  // Auto-detect from request headers (Koyeb sets X-Forwarded-* headers)
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${proto}://${host}`;
}

// ---- CORS preflight ----
router.options('*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.status(204).end();
});

// ---- Proxy a specific URL (used for rewritten HLS segments/keys) ----
function proxyArbitraryUrl(req, res, targetUrl, stream) {
  try { new URL(targetUrl); } catch (e) {
    return res.status(400).json({ error: 'Invalid target URL' });
  }

  const parsedUrl = new URL(targetUrl);
  const mod = parsedUrl.protocol === 'https:' ? https : http;

  const proxyReq = mod.get(targetUrl, {
    headers: { 'User-Agent': 'IPTV-Proxy/2.0' },
    timeout: 15000,
  }, (proxyRes) => {
    // Follow one redirect
    if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
      let loc;
      try { loc = new URL(proxyRes.headers.location, targetUrl).href; } catch { return res.status(502).end(); }
      return res.redirect(loc);
    }

    if (proxyRes.statusCode >= 400) {
      return res.status(502).end();
    }

    ['content-type', 'content-length'].forEach(h => {
      if (proxyRes.headers[h]) res.setHeader(h, proxyRes.headers[h]);
    });
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(proxyRes.statusCode);

    // Rewrite nested .m3u8 playlists too
    if ((proxyRes.headers['content-type'] || '').includes('mpegurl')) {
      let body = '';
      proxyRes.setEncoding('utf8');
      proxyRes.on('data', (chunk) => { body += chunk; });
      proxyRes.on('end', () => {
        res.send(rewriteM3U8(body, stream, req));
      });
    } else {
      proxyRes.pipe(res);
    }
  });

  proxyReq.on('error', () => { if (!res.headersSent) res.status(502).end(); });
  proxyReq.on('timeout', () => { proxyReq.destroy(); if (!res.headersSent) res.status(504).end(); });
  req.on('close', () => proxyReq.destroy());
}

// ---- Rewrite M3U8 so all URLs route through our proxy ----
function rewriteM3U8(m3u8Content, stream, req) {
  const serverUrl = getServerUrl(req);
  const proxyBase = `/live/${stream.id}`;

  const lines = m3u8Content.split('\n');
  const result = [];

  for (let line of lines) {
    const trimmed = line.trim();

    if (trimmed === '' || trimmed.startsWith('#')) {
      // Rewrite #EXT-X-KEY URI if relative
      if (trimmed.startsWith('#EXT-X-KEY') && trimmed.includes('URI="')) {
        line = line.replace(/URI="([^"]+)"/, (match, uri) => {
          if (uri.startsWith('http')) return match;
          return `URI="${serverUrl}${proxyBase}?url=${encodeURIComponent(uri)}"`;
        });
      }
      result.push(line);
      continue;
    }

    // URL line (segment or sub-playlist)
    let absoluteUrl;
    if (trimmed.startsWith('http')) {
      absoluteUrl = trimmed;
    } else {
      const sourceBase = stream.source_url.substring(0, stream.source_url.lastIndexOf('/') + 1);
      absoluteUrl = sourceBase + trimmed;
    }

    result.push(`${serverUrl}${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`);
  }

  return result.join('\n');
}

// ---- Follow redirects with M3U8 rewriting ----
function followRedirect(req, res, url, stream, isHls, depth) {
  if (depth > 5) {
    return res.status(502).json({ error: 'Too many redirects' });
  }

  const parsedUrl = new URL(url);
  const mod = parsedUrl.protocol === 'https:' ? https : http;

  const proxyReq = mod.get(url, {
    headers: { 'User-Agent': 'IPTV-Proxy/2.0', 'Accept': '*/*' },
    timeout: 30000,
  }, (proxyRes) => {
    const code = proxyRes.statusCode;

    if (code >= 300 && code < 400 && proxyRes.headers.location) {
      try {
        const loc = new URL(proxyRes.headers.location, url).href;
        return followRedirect(req, res, loc, stream, isHls, depth + 1);
      } catch (e) {
        return res.status(502).json({ error: 'Invalid redirect URL' });
      }
    }

    if (code >= 400) {
      db.updateStreamHealth(stream.id, 'error', 0);
      return res.status(502).json({ error: `Upstream returned ${code}` });
    }

    ['content-type', 'content-length'].forEach(h => {
      if (proxyRes.headers[h]) res.setHeader(h, proxyRes.headers[h]);
    });
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.status(code);

    // For HLS playlists: rewrite URLs
    if (isHls && (proxyRes.headers['content-type'] || '').includes('mpegurl')) {
      let body = '';
      proxyRes.setEncoding('utf8');
      proxyRes.on('data', (chunk) => { body += chunk; });
      proxyRes.on('end', () => {
        res.send(rewriteM3U8(body, stream, req));
      });
      proxyRes.on('error', () => { if (!res.headersSent) res.status(502).end(); });
    } else {
      // For segments / non-HLS: pipe directly for low latency
      proxyRes.pipe(res);
    }
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!res.headersSent) res.status(504).json({ error: 'Upstream timeout' });
  });
  proxyReq.on('error', (err) => {
    if (!res.headersSent) res.status(502).json({ error: `Source error: ${err.message}` });
  });
  req.on('close', () => proxyReq.destroy());
}

// ---- Main proxy handler ----
function proxyStream(req, res, stream) {
  try {
    new URL(stream.source_url);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid source URL in database' });
  }

  const isHls = stream.stream_type === 'hls' ||
    stream.source_url.includes('.m3u8');

  followRedirect(req, res, stream.source_url, stream, isHls, 0);
}

// ---- Find stream by ID or proxy_path slug ----
function findStream(identifier) {
  // Try direct ID
  let stream = db.getStreamById(identifier);
  if (stream) return stream;

  // Try matching by proxy_path (e.g. /live/al-jazeera -> identifier = "al-jazeera")
  const allStreams = db.getStreams({ status: 'active' });
  return allStreams.find(s => {
    const p = s.proxy_path || `/live/${s.id}`;
    return p === `/${identifier}` || p === `/live/${identifier}`;
  });
}

// ============================================================
// ROUTES (order matters!)
// ============================================================

// GET /live/channel/:channelId - proxy by channel ID
router.get('/channel/:channelId', (req, res) => {
  const { channelId } = req.params;
  const settings = db.getSettings();
  const maxConn = parseInt(settings.max_connections) || 500;
  if (activeConnections.size >= maxConn) {
    return res.status(503).json({ error: 'Server busy' });
  }

  const streams = db.getStreams({ status: 'active' });
  const stream = streams.find(s => s.channel_id === channelId);
  if (!stream) return res.status(404).json({ error: 'No active stream for this channel' });

  proxyStream(req, res, stream);
});

// GET /live/:id - main proxy endpoint (also handles ?url= for rewritten segments)
router.get('/:id', (req, res) => {
  // If ?url= is present, proxy that specific URL (used for HLS segment rewriting)
  if (req.query.url) {
    const stream = findStream(req.params.id);
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    return proxyArbitraryUrl(req, res, req.query.url, stream);
  }

  // Connection limit check
  const settings = db.getSettings();
  const maxConn = parseInt(settings.max_connections) || 500;
  if (activeConnections.size >= maxConn) {
    return res.status(503).json({ error: 'Server busy - max connections reached' });
  }

  // Find the stream
  const stream = findStream(req.params.id);
  if (!stream) return res.status(404).json({ error: 'Stream not found' });
  if (stream.status === 'inactive') return res.status(403).json({ error: 'Stream is inactive' });

  proxyStream(req, res, stream);
});

module.exports = router;
