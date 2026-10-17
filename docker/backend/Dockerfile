FROM composer:2.10.3 AS composer

FROM php:8.5.11-cli-trixie

RUN apt-get update \
    && apt-get install -y --no-install-recommends unzip libpq-dev libonig-dev \
    && docker-php-ext-install -j"$(nproc)" pdo_pgsql mbstring pcntl \
    && pecl install redis-6.3.0 \
    && docker-php-ext-enable redis \
    && cp "$PHP_INI_DIR/php.ini-development" "$PHP_INI_DIR/php.ini" \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer /usr/bin/composer /usr/local/bin/composer

ARG APP_UID=1000
ARG APP_GID=1000

RUN if ! getent group "$APP_GID" > /dev/null; then groupadd --gid "$APP_GID" app; fi \
    && useradd --create-home --uid "$APP_UID" --gid "$APP_GID" app \
    && install -d -o app -g "$APP_GID" /var/www/app /var/www/app/vendor

COPY --chmod=755 entrypoint.sh /usr/local/bin/caseward-entrypoint

WORKDIR /var/www/app
USER app

ENTRYPOINT ["caseward-entrypoint"]
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000"]
