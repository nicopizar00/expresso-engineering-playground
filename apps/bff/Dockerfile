# Multi-stage Dockerfile for the BFF.
#
# Build context is the repo root (see infra/docker/compose.yaml) so the
# pnpm workspace, packages/*, and apps/bff/ are all visible. A repo-root
# .dockerignore is required — without it, host node_modules from the
# workspace get COPYed into the image and override the in-container install.
#
# Workspace dependency note: packages/shared-types and packages/contracts
# expose `"main": "src/index.ts"` and have no real build step. The BFF only
# imports them via `import type`, which tsc erases, so dist/main.js never
# requires those .ts files at runtime. Adding a value-level import from a
# workspace package will break the image until those packages are built
# with tsc — that is a separate iteration.
#
# Stages:
#   dev     — used by docker compose watch (pg:dev); runs nest --watch
#   builder — compiles the production bundle
#   runtime — minimal image that runs the compiled bundle

# ---- dev (watch mode) -------------------------------------------------------
FROM node:20-alpine AS dev
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/bff/package.json apps/bff/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/contracts/package.json packages/contracts/
COPY packages/config/package.json packages/config/
COPY packages/test-utils/package.json packages/test-utils/

RUN pnpm install --frozen-lockfile

COPY packages/ packages/
COPY apps/bff/ apps/bff/

RUN pnpm --filter @mini-commerce/bff exec prisma generate

EXPOSE 3001
CMD ["pnpm", "--filter", "@mini-commerce/bff", "dev"]

# ---- builder ----------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Manifests first so the install layer caches on dependency changes only.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/bff/package.json apps/bff/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/contracts/package.json packages/contracts/
COPY packages/config/package.json packages/config/
COPY packages/test-utils/package.json packages/test-utils/

RUN pnpm install --frozen-lockfile

# Now bring in sources and build the bff bundle.
COPY packages/ packages/
COPY apps/bff/ apps/bff/

RUN pnpm --filter @mini-commerce/bff exec prisma generate
RUN pnpm --filter @mini-commerce/bff build

# ---- runtime ----------------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY --from=builder /workspace/package.json /workspace/pnpm-lock.yaml /workspace/pnpm-workspace.yaml ./
COPY --from=builder /workspace/apps/bff/package.json apps/bff/
COPY --from=builder /workspace/packages packages/
COPY --from=builder /workspace/apps/bff/dist apps/bff/dist/
# Prisma schema required for prisma generate in the runtime stage.
COPY --from=builder /workspace/apps/bff/prisma apps/bff/prisma/

RUN pnpm install --prod --frozen-lockfile --filter @mini-commerce/bff...
RUN pnpm --filter @mini-commerce/bff exec prisma generate

EXPOSE 3001

# Node-based probe — Alpine has no curl by default and we want to avoid an
# apk layer just for healthcheck plumbing.
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=10 \
  CMD node -e "require('http').get('http://127.0.0.1:3001/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "apps/bff/dist/main.js"]
