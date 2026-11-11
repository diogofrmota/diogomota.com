# syntax=docker/dockerfile:1

# Production image: the Next.js standalone server plus the migration runner.
#
# db/migrations is outside this build context, so pass it in as a named context.
# From the repo root:
#   docker build --build-context migrations=db/migrations -t diogomota-com ./app
# Without that flag the image still builds, but contains no migrations and
# `npm run migrate` in it fails with "No migrations found".

# Empty placeholder, replaced by --build-context migrations=...
FROM scratch AS migrations

FROM node:22-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# public/ is optional in the source tree but copied into the final image below.
RUN mkdir -p public && npm run build

FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MIGRATIONS_DIR=/app/db/migrations \
    NPM_CONFIG_UPDATE_NOTIFIER=false

COPY --from=builder /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder /app/scripts ./scripts
COPY --from=migrations / ./db/migrations/

# What the app writes while it runs: the profile pictures (lib/avatars.ts).
# docker-compose.prod.yml mounts a volume here, which takes this folder's owner
# when it is first created, so the app (user node) can write to it.
RUN mkdir -p /app/data/avatars && chown -R node:node /app/data
ENV AVATAR_DIR=/app/data/avatars

# The image's version tag (vX.Y.Z), passed in by deploy.yml and shown on /apps.
# Set last so a new version doesn't invalidate the layers above.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

USER node
EXPOSE 3000
CMD ["node", "server.js"]
