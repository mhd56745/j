// ============================================================
// Database Seeding Script
// ============================================================

const path = require('path');
const db = require(path.join(__dirname, '..', 'api', 'database'));

db.init();

console.log('[SEED] Starting database seeding...');

const { v4: uuid } = require('uuid');

// Categories
const cats = [
  { id: uuid(), name: 'Sports', sort_order: 0 },
  { id: uuid(), name: 'News', sort_order: 1 },
  { id: uuid(), name: 'Entertainment', sort_order: 2 },
  { id: uuid(), name: 'Kids', sort_order: 3 },
  { id: uuid(), name: 'Music', sort_order: 4 },
  { id: uuid(), name: 'Documentary', sort_order: 5 },
  { id: uuid(), name: 'Religious', sort_order: 6 },
];

const insertCat = db.getDb().prepare('INSERT OR IGNORE INTO categories (id, name, sort_order) VALUES (?, ?, ?)');
for (const c of cats) insertCat.run(c.id, c.name, c.sort_order);

// Channels
const channels = [
  { name: 'ESPN Sports HD', epg: 'ESPN1', catIdx: 0 },
  { name: 'Sky Sports News', epg: 'SSN', catIdx: 0 },
  { name: 'BT Sport 1', epg: 'BTS1', catIdx: 0 },
  { name: 'BeIN Sports 1', epg: 'B1S1', catIdx: 0 },
  { name: 'BBC News HD', epg: 'BBCN', catIdx: 1 },
  { name: 'CNN International', epg: 'CNNI', catIdx: 1 },
  { name: 'Al Jazeera English', epg: 'AJE', catIdx: 1 },
  { name: 'Fox News', epg: 'FNN', catIdx: 1 },
  { name: 'HBO HD', epg: 'HBO', catIdx: 2 },
  { name: 'AMC', epg: 'AMC', catIdx: 2 },
  { name: 'FX HD', epg: 'FXHD', catIdx: 2 },
  { name: 'Comedy Central', epg: 'COMC', catIdx: 2 },
  { name: 'Cartoon Network', epg: 'CN', catIdx: 3 },
  { name: 'Disney Channel', epg: 'DISN', catIdx: 3 },
  { name: 'Nickelodeon', epg: 'NICK', catIdx: 3 },
  { name: 'Boomerang', epg: 'BOOM', catIdx: 3 },
  { name: 'MTV Music', epg: 'MTV', catIdx: 4 },
  { name: 'VH1 Classic', epg: 'VH1', catIdx: 4 },
  { name: 'BET', epg: 'BET', catIdx: 4 },
  { name: 'National Geographic', epg: 'NGC', catIdx: 5 },
  { name: 'Discovery Channel', epg: 'DISC', catIdx: 5 },
  { name: 'History HD', epg: 'HIST', catIdx: 5 },
  { name: 'Peace TV', epg: 'PTV', catIdx: 6 },
  { name: 'Quran TV', epg: 'QTV', catIdx: 6 },
];

const insertCh = db.getDb().prepare('INSERT OR IGNORE INTO channels (id, name, epg_id, category_id, sort_order) VALUES (?, ?, ?, ?, ?)');
const channelIds = [];
channels.forEach((ch, i) => {
  const id = uuid();
  channelIds.push(id);
  insertCh.run(id, ch.name, ch.epg, cats[ch.catIdx].id, i);
});

// Streams
const streamData = [
  { chIdx: 0, url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', type: 'hls', quality: '1080p', bitrate: 8000, status: 'active', ms: 35 },
  { chIdx: 1, url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', type: 'hls', quality: '720p', bitrate: 4500, status: 'active', ms: 42 },
  { chIdx: 2, url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', type: 'hls', quality: '1080p', bitrate: 7000, status: 'active', ms: 28 },
  { chIdx: 3, url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', type: 'hls', quality: '1080p', bitrate: 6000, status: 'active', ms: 31 },
  { chIdx: 4, url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', type: 'hls', quality: '720p', bitrate: 3000, status: 'active', ms: 55 },
  { chIdx: 5, url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', type: 'hls', quality: '1080p', bitrate: 5000, status: 'active', ms: 38 },
  { chIdx: 6, url: 'https://invalid-stream.example.com/test.m3u8', type: 'hls', quality: '720p', bitrate: 3500, status: 'error', ms: 2500 },
  { chIdx: 7, url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', type: 'hls', quality: '1080p', bitrate: 5000, status: 'active', ms: 44 },
  { chIdx: 8, url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', type: 'hls', quality: '1080p', bitrate: 8000, status: 'active', ms: 30 },
  { chIdx: 9, url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', type: 'hls', quality: '1080p', bitrate: 6000, status: 'active', ms: 45 },
  { chIdx: 10, url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', type: 'hls', quality: '720p', bitrate: 4000, status: 'active', ms: 37 },
  { chIdx: 11, url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', type: 'hls', quality: '720p', bitrate: 3500, status: 'active', ms: 50 },
  { chIdx: 12, url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', type: 'hls', quality: '720p', bitrate: 4000, status: 'active', ms: 22 },
  { chIdx: 13, url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', type: 'hls', quality: '720p', bitrate: 4000, status: 'active', ms: 31 },
  { chIdx: 14, url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', type: 'hls', quality: '480p', bitrate: 2500, status: 'active', ms: 27 },
  { chIdx: 15, url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', type: 'hls', quality: '480p', bitrate: 2000, status: 'active', ms: 48 },
  { chIdx: 16, url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', type: 'hls', quality: '720p', bitrate: 3000, status: 'active', ms: 26 },
  { chIdx: 17, url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', type: 'rtmp', quality: '480p', bitrate: 2000, status: 'active', ms: 65 },
  { chIdx: 18, url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', type: 'hls', quality: '720p', bitrate: 2500, status: 'active', ms: 33 },
  { chIdx: 19, url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', type: 'hls', quality: '1080p', bitrate: 6000, status: 'active', ms: 40 },
  { chIdx: 20, url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', type: 'hls', quality: '1080p', bitrate: 7000, status: 'active', ms: 36 },
  { chIdx: 21, url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', type: 'hls', quality: '1080p', bitrate: 6500, status: 'inactive', ms: null },
  { chIdx: 22, url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', type: 'hls', quality: '480p', bitrate: 1500, status: 'active', ms: 58 },
  { chIdx: 23, url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', type: 'hls', quality: '480p', bitrate: 1500, status: 'active', ms: 52 },
];

const insertStream = db.getDb().prepare(`
  INSERT OR IGNORE INTO streams (id, name, channel_id, source_url, stream_type, quality, status,
    proxy_path, max_bitrate, cpu_limit, memo_limit, health_check, last_check, response_ms)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), ?)
`);

for (const s of streamData) {
  const ch = channels[s.chIdx];
  const id = uuid();
  const proxyPath = `/live/${ch.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  insertStream.run(id, ch.name, channelIds[s.chIdx], s.url, s.type, s.quality, s.status,
    proxyPath, s.bitrate, s.quality === '4k' ? 80 : 50, s.quality === '4k' ? 512 : 256, s.ms);
}

db.log('system', 'Database seeded with sample data', 'info');

console.log(`
[SEED] Done!
  Categories: ${cats.length}
  Channels:   ${channels.length}
  Streams:    ${streamData.length}
`);