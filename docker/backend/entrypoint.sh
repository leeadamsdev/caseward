#!/bin/sh
set -eu

if [ ! -f .env ]; then
    cp .env.example .env
fi

mkdir -p bootstrap/cache storage/framework/views

composer install --no-interaction --prefer-dist --no-progress

php artisan migrate --no-interaction

exec "$@"
