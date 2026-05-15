# Multi-stage Dockerfile for the BFF.
#
# Build context is the repo root (see infra/docker/compose.yaml) so the
# pnpm workspace, packages/*, and apps/bff/ are all visible to the build.

# ---- builder ----------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/bff/package.json apps/bff/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/contracts/package.json packages/contracts/
COPY packages/config/package.json packages/config/
COPY packages/test-utils/package.json packages/test-utils/

RUN pnpm install --frozen-lockfile=false

COPY packages/ packages/
COPY apps/bff/ apps/bff/

RUN pnpm --filter @mini-commerce/bff build

# ---- runtime ----------------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY --from=builder /workspace/package.json /workspace/pnpm-workspace.yaml ./
COPY --from=builder /workspace/apps/bff/package.json apps/bff/
COPY --from=builder /workspace/packages packages/
COPY --from=builder /workspace/apps/bff/dist apps/bff/dist/

RUN pnpm install --prod --frozen-lockfile=false --filter @mini-commerce/bff...

EXPOSE 3001
CMD ["node", "apps/bff/dist/main.js"]
