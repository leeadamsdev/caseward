#!/bin/sh
set -eu

if [ ! -f .env ]; then
    cp .env.example .env
fi

mkdir -p bootstrap/cache storage/framework/views

composer install --no-interaction --prefer-dist --no-progress

if [ -z "${APP_KEY:-}" ] && grep -Eq '^APP_KEY=[[:space:]]*$' .env; then
    php artisan key:generate --no-interaction
fi

php artisan migrate --no-interaction

exec "$@"
