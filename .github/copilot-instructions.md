# GitHub Copilot — Project Instructions

This file provides context for GitHub Copilot, Codex, and any AI pair-programming
tool operating on this repository. Read it before suggesting or generating code.

---

## What this repo is

A **modular monolith mini-commerce playground** for a fictional espresso store:
catalog → cart → checkout → orders. The domain is intentionally simple; the
goal is to practice and demonstrate software engineering techniques
(modularity, testing, observability, distributed-system patterns) in a
realistic but low-stakes context.

Stack: NestJS BFF (port 3001) · Next.js web app (port 3000) ·
       Three.js 3D visualizer (port 3002) · Prisma + PostgreSQL ·
       OpenTelemetry · Docker Compose · pnpm workspaces + Turborepo

---

## Repository layout

```
apps/
  bff/              NestJS BFF — REST API, Prisma, domain modules
  web/              Next.js 14 web app (App Router)
  visualizer-3d/    Static Three.js scene served by nginx
    public/
      scene.js      ← the only file that matters for the 3D visualizer
      index.html
      style.css
packages/
  shared-types/     Branded domain types (ProductId, OrderId, …)
  contracts/        TypeScript HTTP wire shapes
docs/
  next-steps/       Per-topic WIP tracking documents
  visualizer/       Art direction and aesthetic spec for 3D assets
```

---

## Active feature: PS1 Espresso Cup (WIP / Beta)

Branch: `feature/ps1-espresso-cup`

The 3D visualizer renders domain catalogue items as PS1-era low-poly objects.
The current asset under development is the **Classic Espresso cup**.

### Current state
- `buildSquareFrustum(topW, botW, h)` — shared `BufferGeometry` primitive,
  8 vertices / 12 triangles, exact spec topology
- `ESPRESSO_CFG` — all geometry dimensions in one configurable block (top of
  `scene.js`), no magic numbers in builders
- `ESPRESSO_PALETTE` — five named colours extracted from the design spec
- 28 total triangles (within 30-triangle PS1 budget)
- `MeshLambertMaterial` + `flatShading: true` + 16×16 `NearestFilter` texture

### Known artistic deficiencies (pending approval)
1. Cup colour should be **white ceramic** (`#F1ECDA`), not mid-beige
2. Saucer needs an **angled/sloped top surface** — currently a flat box
3. Coffee fill visibility is **too small** — `coffeeShrink` should decrease
4. Model is **slightly too large** — reduce all dims by ~20–25%

Full detail: `docs/next-steps/ps1-espresso-cup.md`
Art rules: `docs/visualizer/art-direction.md`

---

## Code conventions

### BFF (NestJS)
- Every domain feature: `<domain>.module.ts`, `.service.ts`, `.controller.ts`, `.types.ts`
- Never import a service from another module's internal files — only from the module barrel
- Use `class-validator` DTOs; `ValidationPipe` is applied globally
- Money is always `{ amountMinor: number, currency: string }` — no floats
- Use branded types from `@mini-commerce/shared-types`

### Web (Next.js)
- App Router; server components by default, client only when needed
- API calls go through `/api/bff/*` rewrite — never directly to port 3001

### Visualizer (`apps/visualizer-3d/public/scene.js`)
- Vanilla ES module, no build step, no npm install
- Three.js 0.161.0 loaded via ESM importmap from esm.sh CDN
- All geometry constants in `ESPRESSO_CFG` / `*_CFG` blocks at file top
- Use `buildSquareFrustum` for any box or tapered-box shape
- Use `MeshLambertMaterial` + `flatShading: true` for all domain assets
- Use `NearestFilter` on all canvas textures — no interpolation
- `clearGroup` disposes geometry, material, and map (texture) for each child
- New domain asset types: add a `build*Group(color)` function and dispatch in
  `buildItemMesh` via `item.metadata?.category`

### General
- No `Co-Authored-By: Claude` in commits or PRs
- No comments explaining WHAT code does — only WHY when non-obvious
- No mock databases in tests — hit real DB to avoid prod divergence
- TypeScript strict mode; no `any` casts without justification

---

## Running the project

```bash
cp .env.example .env
./dev up          # postgres + BFF (auto-migrates, auto-seeds)
./dev up web      # + Next.js
./dev up full     # + visualizer-3d
./dev smoke       # hit all 9 endpoints, assert 200/201
```

Preview server for visualizer only (no Docker):
```bash
npx serve -p 3002 apps/visualizer-3d/public
```

---

## Suggested Copilot prompt for the visualizer

When working on `apps/visualizer-3d/public/scene.js`:

> Modify only `ESPRESSO_CFG` and `buildEspressoGroup`. Do not change
> `buildSquareFrustum`, `makePsxTexture`, `clearGroup`, or the SSE/polling
> infrastructure. Keep polygon budget ≤ 28 triangles. Keep `flatShading: true`
> and `NearestFilter`. Verify the silhouette from four angles before reporting
> done. See `docs/next-steps/ps1-espresso-cup.md` for the open issues list.
