# Multi-stage Dockerfile for the web app (Next.js).
#
# Build context is the repo root (same pattern as apps/bff/Dockerfile) so the
# pnpm workspace, packages/*, and apps/web/ are all visible.
#
# Stages:
#   deps    — install all workspace dependencies (shared base)
#   dev     — used by docker compose watch (pg:dev); runs `next dev`
#   builder — production build with `output: "standalone"`
#   runtime — minimal image that runs the standalone server

# ---- deps -------------------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/contracts/package.json packages/contracts/
COPY packages/config/package.json packages/config/
COPY packages/test-utils/package.json packages/test-utils/

RUN pnpm install --frozen-lockfile

# ---- dev (watch mode) -------------------------------------------------------
FROM deps AS dev
COPY packages/ packages/
COPY apps/web/ apps/web/

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000
CMD ["pnpm", "--filter", "@mini-commerce/web", "dev"]

# ---- builder ----------------------------------------------------------------
FROM deps AS builder
COPY packages/ packages/
COPY apps/web/ apps/web/

RUN pnpm --filter @mini-commerce/web build

# ---- runtime ----------------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone output bundles everything needed to run the server.
# Static assets and public files must be copied separately.
COPY --from=builder /workspace/apps/web/.next/standalone ./
COPY --from=builder /workspace/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000

HEALTHCHECK --interval=5s --timeout=3s --start-period=15s --retries=10 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/', r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
