#!/bin/sh
# ================================================================
# Docker Entrypoint - Start both Node.js app and Nginx
# ================================================================
set -e

echo "[ENTRYPOINT] Starting IPTV Restreaming Server..."

# Generate stream config from the app
echo "[ENTRYPOINT] Generating nginx stream configuration..."
node -e "
const db = require('/app/api/database');
db.init();
const streams = db.getStreams({status: 'active'});
const fs = require('fs');
let template = fs.readFileSync('/etc/nginx/stream.conf.template', 'utf8');
template = template.replace('__STREAM_LOCATIONS__', '');
template = template.replace('__RTMP_APPS__', '');
fs.writeFileSync('/etc/nginx/stream.conf', template);
console.log('[ENTRYPOINT] Generated config for ' + streams.length + ' streams');
"

# Start Node.js app in background
echo "[ENTRYPOINT] Starting Node.js admin panel on port 3000..."
cd /app
node server.js &
NODE_PID=$!

# Start nginx in foreground
echo "[ENTRYPOINT] Starting Nginx on ports 8080/1935..."
nginx -g 'daemon off;' &
NGINX_PID=$!

# Wait for either process to exit
wait -n $NODE_PID $NGINX_PID
echo "[ENTRYPOINT] A process exited, shutting down..."
kill $NODE_PID $NGINX_PID 2>/dev/null
wait