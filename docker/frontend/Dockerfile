FROM node:24.22.0-trixie-slim AS base

RUN npm install --global pnpm@12.14.0 --allow-scripts=pnpm --no-fund

ARG APP_UID=1000
ARG APP_GID=1000

RUN if ! getent group "$APP_GID" > /dev/null; then groupmod --gid "$APP_GID" node; fi \
    && usermod --uid "$APP_UID" --gid "$APP_GID" node \
    && install -d -o node -g "$APP_GID" /var/www/app /var/www/app/node_modules

COPY --chmod=755 entrypoint.sh /usr/local/bin/caseward-entrypoint

WORKDIR /var/www/app
USER node

ENTRYPOINT ["caseward-entrypoint"]
CMD ["pnpm", "run", "dev", "--host", "0.0.0.0", "--port", "5173"]

FROM base AS browser-tests

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

USER root
ARG PLAYWRIGHT_VERSION
RUN test -n "$PLAYWRIGHT_VERSION" \
    && pnpm dlx "playwright@$PLAYWRIGHT_VERSION" install --with-deps --only-shell chromium \
    && rm -rf /var/lib/apt/lists/*
USER node

# Keep browser tooling out of the default development image.
FROM base AS development
