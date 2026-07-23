const express = require('express');
const db = require('../database');
const { authMiddleware } = require('./auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  try {
    const settings = db.getSettings();
    const s = settings;

    const serverIp = s.server_ip || req.get('x-forwarded-host') || req.get('host') || '_';
    const nginxPort = s.nginx_port || '3000';
    const hlsPort = s.hls_port || '8081';
    const rtmpPort = s.rtmp_port || '1935';
    const maxConns = s.max_connections || '500';
    const workers = s.worker_processes || 'auto';
    const bodySize = s.client_body_size || '10m';
    const bufSize = s.proxy_buffer_size || '16k';
    const cacheSize = s.cache_size || '256m';
    const cacheMax = s.cache_max_size || '1g';
    const cacheInactive = s.cache_inactive || '10m';

    const streams = db.getStreams({ status: 'active' });

    let locationBlocks = '';
    let rtmpApps = '';

    for (const stream of streams) {
      const path = stream.proxy_path || `/live/${stream.id}`;
      const safeName = stream.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const limitRate = stream.max_bitrate ? `limit_rate ${Math.floor(stream.max_bitrate * 1024 / 8)};` : '';

      if (stream.stream_type === 'hls') {
        locationBlocks += `
    # ${stream.name} [${stream.channel_name || ''}]
    location ${path} {
        proxy_pass ${stream.source_url};
        proxy_ssl_server_name on;
        proxy_buffering on;
        proxy_buffer_size ${bufSize};
        proxy_buffers 8 ${bufSize};
        proxy_cache_valid 200 302 2s;
        proxy_cache_valid 404 1s;
        proxy_cache_use_stale error timeout updating;
        add_header X-Stream-Name "${stream.name}";
        add_header Cache-Control "public, max-age=2";
        ${limitRate}
    }
`;
      } else if (stream.stream_type === 'rtmp' || stream.stream_type === 'rtsp') {
        rtmpApps += `
        # ${stream.name} [${stream.channel_name || ''}]
        application ${safeName} {
            live on;
            record off;
            interleave on;
            push ${stream.source_url};
            ${stream.max_bitrate ? `max_bitrate ${stream.max_bitrate};` : ''}
        }
`;
        locationBlocks += `
    # ${stream.name} [${stream.channel_name || ''}]
    location ${path} {
        proxy_pass http://127.0.0.1:${hlsPort}/${safeName};
        proxy_buffering on;
        ${limitRate}
    }
`;
      } else {
        locationBlocks += `
    # ${stream.name} [${stream.channel_name || ''}]
    location ${path} {
        proxy_pass ${stream.source_url};
        proxy_ssl_server_name on;
        proxy_buffering on;
        ${limitRate}
    }
`;
      }
    }

    const config = `# ================================================================
# IPTV Restreaming Server - Nginx Configuration
# Optimized for Low VPS / Koyeb Deployment
# Generated: ${new Date().toISOString()}
# Active Streams: ${streams.length}
# ================================================================

# ---- Worker config for low-memory VPS ----
worker_processes ${workers};
worker_rlimit_nofile ${parseInt(maxConns) * 2};
pid /tmp/nginx.pid;
error_log /var/log/nginx/error.log warn;

events {
    worker_connections ${maxConns};
    multi_accept on;
    use epoll;
}

http {
    # ---- Essential Settings ----
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 30;
    keepalive_requests 1000;
    types_hash_max_size 1024;
    client_body_timeout 10;
    client_header_timeout 10;
    send_timeout 10;
    client_max_body_size ${bodySize};
    server_tokens off;
    reset_timedout_connection on;

    # ---- MIME ----
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # ---- Logging (minimal I/O for low VPS) ----
    access_log off;
    # access_log /var/log/nginx/access.log combined buffer=16k flush=2m;

    # ---- Gzip (low CPU) ----
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 1;
    gzip_min_length 512;
    gzip_types text/plain text/css application/json application/javascript text/xml;

    # ---- Proxy Cache (low memory footprint) ----
    proxy_cache_path /tmp/nginx_cache levels=1:2
        keys_zone=iptv:${cacheSize}
        max_size=${cacheMax} inactive=${cacheInactive}
        use_temp_path=off;

    # ---- Rate Limiting ----
    limit_req_zone $binary_remote_addr zone=api:5m rate=20r/s;
    limit_conn_zone $binary_remote_addr zone=connlimit:5m;

    # ---- Upstream: Admin Panel ----
    upstream admin_backend {
        server 127.0.0.1:3000;
        keepalive 16;
    }

    # ---- Main Server Block ----
    server {
        listen ${nginxPort};
        server_name ${serverIp};

        # Admin Panel
        location / {
            proxy_pass http://admin_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache iptv;
            proxy_cache_valid 200 10s;
            proxy_cache_use_stale error timeout updating;
        }

        # ---- Stream Proxy Locations ----
${locationBlocks}

        # ---- Health Endpoint ----
        location /health {
            access_log off;
            return 200 '{"status":"ok"}';
            add_header Content-Type application/json;
        }

        # ---- Deny Hidden Files ----
        location ~ /\\. {
            deny all;
            access_log off;
            log_not_found off;
        }

        limit_conn connlimit 15;
        limit_req zone=api burst=30 nodelay;
    }
}

# ---- RTMP Module (requires nginx-rtmp-module) ----
rtmp {
    server {
        listen ${rtmpPort};
        chunk_size 4096;
        buflen 3s;
${rtmpApps || '        # No RTMP/RTSP streams configured'}
    }
}`;

    db.log('config_generated', `Nginx config generated for ${streams.length} streams`, 'info');
    res.json({ config, streamCount: streams.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;