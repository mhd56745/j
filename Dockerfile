# ============================================
# IPTV Panel - Dockerfile
# ============================================
# Multi-stage build: Nginx with RTMP + PHP-FPM + Laravel
# ============================================

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Main application image
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install system packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    php8.1-fpm \
    php8.1-cli \
    php8.1-mysql \
    php8.1-mbstring \
    php8.1-xml \
    php8.1-bcmath \
    php8.1-curl \
    php8.1-zip \
    php8.1-gd \
    php8.1-intl \
    php8.1-readline \
    php8.1-redis \
    ffmpeg \
    supervisor \
    curl \
    unzip \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# Install Nginx RTMP module
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnginx-mod-rtmp \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy backend
COPY backend/ ./backend/
WORKDIR /app/backend
RUN composer install --no-dev --optimize-autoloader --no-interaction

# Copy frontend build
COPY --from=frontend-build /app/frontend/dist ./public/frontend/

# Copy Nginx configs
COPY nginx/ /etc/nginx-custom/

# Setup storage directories
RUN mkdir -p /app/storage/app/{hls,recordings,vod} \
    && mkdir -p /app/storage/framework/{cache,sessions,views} \
    && mkdir -p /app/storage/logs \
    && chown -R www-data:www-data /app/storage \
    && chmod -R 775 /app/storage

# Copy Supervisor config
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Copy entrypoint
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose ports
EXPOSE 80 1935 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost/ || exit 1

ENTRYPOINT ["/entrypoint.sh"]