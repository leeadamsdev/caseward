#!/bin/sh
set -eu

pnpm install --frozen-lockfile --prefer-offline

exec "$@"
