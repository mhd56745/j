web: cd backend && php artisan serve --host=0.0.0.0 --port=$PORT
worker: cd backend && php artisan queue:work --daemon --tries=3
rtmp: nginx -c /app/nginx/nginx.conf -g 'daemon off;'