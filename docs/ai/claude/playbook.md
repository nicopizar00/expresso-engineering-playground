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

The Classic Espresso cup is the first domain asset. Owner artistic approval
is pending — see
[`../../next-steps/ps1-espresso-cup.md`](../../next-steps/ps1-espresso-cup.md)
for the open issues list and
[`../../visualizer/art-direction.md`](../../visualizer/art-direction.md) for
the polygon/texture/material rules. **Working agreements:**

- Edit only `ESPRESSO_CFG` and `buildEspressoGroup` in
  `apps/visualizer-3d/public/scene.js`.
- Never touch `buildSquareFrustum`, `makePsxTexture`, `clearGroup`, or the
  SSE/polling infrastructure.
- Preview without Docker: `npx serve -p 3002 apps/visualizer-3d/public`.
- Verify silhouette from 4 angles before reporting done.

New domain assets follow the `buildEspressoGroup` + `ESPRESSO_CFG` pattern
and dispatch from `buildItemMesh` on `item.metadata?.category`. Add a
`docs/next-steps/<topic>.md` before implementing.

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
