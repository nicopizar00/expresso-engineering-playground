FROM node:lts-alpine AS builder
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM grafana/k6:0.55.0
COPY --from=builder /build/dist/smoke.js /scripts/smoke.js
