# Claude Code — Execution Playbook

> The rules Claude Code follows when editing this repo. CLAUDE.md (root) is a
> thin pointer to this file. Conventions that belong to the _architecture_ live
> in `docs/architecture/`; this playbook only covers **execution discipline**.

## Working agreements (durable)

- **No AI attribution.** Never add `Co-Authored-By: Claude`,
  `Generated with Claude Code`, or any other Claude/Anthropic marker to commit
  messages, PR descriptions, or generated docs. The repo owner authors all
  attribution.
- **English only** for committed content (code, comments, docs, commit
  messages, PR text, UI copy). Conversation with the owner may happen in
  Spanish.
- **No real names**, URLs, IPs, or credentials in committed content. The
  domain is a fictional mini-commerce store.

## What this repo is — in one paragraph

An engineering playground for a fictional mini-commerce store (catalog → cart
→ checkout → orders → 3D visualizer). A modular monolith today: catalog and
orders are Prisma/PostgreSQL-backed; the cart is intentionally in-memory and
single-user. Phase 3 will extract modules into services; the current folder
layout is designed so that's a relocation, not a rewrite.

For the stack inventory see
[`../../architecture/containers.md`](../../architecture/containers.md). For
the BFF module rules see
[`../../architecture/bff-modules.md`](../../architecture/bff-modules.md).

## Decision points before editing

1. **Is there an open thread?** Skim
   [`../../next-steps/README.md`](../../next-steps/README.md). If the task
   matches one, follow that file.
2. **Is there an ADR?** [`../../adr/README.md`](../../adr/README.md). Don't
   silently invalidate one.
3. **Is the architecture spoke up to date?** If your edit changes a fact in
   `architecture/`, update it in the same commit.
4. **Use `EnterPlanMode`** for non-trivial design work (multi-file refactor,
   new module). Skip it for typos and one-shot edits.

## Validation matrix

Run before reporting done. Pick the narrowest applicable row.

| Change scope                        | Required                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| One file, no public API change      | `pnpm --filter <pkg> test` for that package                                                   |
| Cross-package or new public API     | `pnpm typecheck` + `pnpm test`                                                                |
| BFF endpoint added or shape changed | + `./dev smoke`                                                                               |
| Compose / `scripts/pg/` change      | + `pnpm pg:test` + `./dev doctor`                                                             |
| UI change                           | + open the page in a browser (real or screenshot tool); do not infer success from types alone |
| Anything touching CI                | `pnpm lint` + `pnpm format` + impacted job locally                                            |

If you can't run a check, **say so explicitly** in the wrap-up — don't claim
success.

## 3D visualizer (active feature)

`apps/visualizer-3d/public/` is a static ESM module graph served by nginx
(no bundler). Per-concern modules:

| File | Owns |
|---|---|
| `scene.js` | Entry shim: DOM + Three.js bootstrap + factory wiring (~95 lines). |
| `utils.js` | `clamp`. |
| `materials.js` | `ESPRESSO_PALETTE`, `STATUS_COLORS`, `desaturateHex`, `makePsxTexture`. |
| `geometry/frustum.js` | `buildSquareFrustum`, `buildOpenFrustum` (the Standard-tier building blocks). |
| `objects/room.js` | `ROOM`, `buildRoom`. |
| `objects/espresso-cup.js` | `ESPRESSO_CFG` (DEV ENTRY POINT) + `buildEspressoGroup`. |
| `objects/scene-meshes.js` | `buildProductMesh`, `buildOrderMesh`, `buildAggregateMesh`, `buildCartMesh`. |
| `objects/disposal.js` | `clearGroup` (canvas-texture-aware). |
| `layout/render.js` | `createRenderer({ dataGroup })`, `createAnimator({...})`, hero/scale constants, `sceneObjectCount`. |
| `transport.js` | `API_BASE`, `initTransport({...})` → `{ connect, pauseForHidden }`. |
| `fallback.js` | `FALLBACK_SCENE` (offline typed showcase). |

**Working agreements:**

- A visual / asset change touches one focused module, not `scene.js`.
- Preview without Docker: `npx serve -p 3002 apps/visualizer-3d/public`.
- Verify silhouette from 4 angles before reporting done.
- Art rules (Lambert + flatShading, NearestFilter, palette, polygon budget)
  live in [`../../visualizer/art-direction.md`](../../visualizer/art-direction.md)
  and apply to every domain asset.
- The Classic Espresso cup record (acceptance criteria, sign-off history)
  lives in [`../../next-steps/ps1-espresso-cup.md`](../../next-steps/ps1-espresso-cup.md).

New domain assets follow the `buildEspressoGroup` + `ESPRESSO_CFG` pattern
in a new `objects/<asset>.js`, dispatch from a per-role factory in
`objects/scene-meshes.js`, and pick up an offline fallback in `fallback.js`.
Add a `docs/next-steps/<topic>.md` before implementing.

## Prompt shape

Long-form Claude Code prompts follow this shape:

```text
ROLE / GOAL / READ FIRST / CONFIRM IN CODE / DESIGN / VALIDATE
```

Reference architecture spokes by link, not by inlined copy.

## Tooling efficiency

For subagent picks, parallel tool calls, `/loop` cadence, and memory rules,
see [`../tooling-efficiency.md`](../tooling-efficiency.md).

## Related

- AI roster: [`../README.md`](../README.md)
- Codex (governance / scope framing): [`../codex/governance.md`](../codex/governance.md)
- Quality gates: [`../../quality-strategy/README.md`](../../quality-strategy/README.md)
