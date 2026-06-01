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

# The browser talks only to this app (same origin); the Next.js server proxies
# to the other containers over the internal Docker network. The rewrite targets
# are resolved when next.config.mjs loads, so they must be present at build time
# for the standalone server. Internal service names are baked here; compose can
# override via build.args (see infra/docker/compose.yaml).
ARG BFF_INTERNAL_URL=http://localhost:3001
ARG VISUALIZER_INTERNAL_URL=http://localhost:3002
# NEXT_PUBLIC_VISUALIZER_URL is the host-reachable link used to open the
# visualizer standalone in a new tab; it is inlined into the client bundle.
ARG NEXT_PUBLIC_VISUALIZER_URL=http://localhost:3002
# NEXT_PUBLIC_PRISMA_STUDIO_URL gates the "Admin" link in the header and the
# Prisma Studio link on /dev. Empty default = link hidden in the built bundle.
ARG NEXT_PUBLIC_PRISMA_STUDIO_URL=
ENV BFF_INTERNAL_URL=$BFF_INTERNAL_URL
ENV VISUALIZER_INTERNAL_URL=$VISUALIZER_INTERNAL_URL
ENV NEXT_PUBLIC_VISUALIZER_URL=$NEXT_PUBLIC_VISUALIZER_URL
ENV NEXT_PUBLIC_PRISMA_STUDIO_URL=$NEXT_PUBLIC_PRISMA_STUDIO_URL

RUN pnpm --filter @mini-commerce/web build

# ---- runtime ----------------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone output bundles everything needed to run the server. In a pnpm
# monorepo, Next.js traces from the workspace root, so the server entrypoint
# lands at apps/web/server.js (not the standalone root) and static assets must
# sit beside it at apps/web/.next/static.
COPY --from=builder /workspace/apps/web/.next/standalone ./
COPY --from=builder /workspace/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000

HEALTHCHECK --interval=5s --timeout=3s --start-period=15s --retries=10 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/', r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "apps/web/server.js"]
