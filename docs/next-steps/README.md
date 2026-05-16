# Next Steps

Open threads of work for this repo. Each file is self-contained — a future
session (human or Claude Code) can read one and have everything needed to
pick up the thread.

Anchors live in source code as `// TODO(next-steps/<topic>)` or
`# TODO(next-steps/<topic>)` comments. Find them all with:

```bash
grep -rn "next-steps/" --include='*.ts' --include='*.prisma' --include='*.mjs' --include='*.yaml' .
```

The count next to each entry below is the number of source anchors today.
When the count drops to zero, the topic is done.

## Open threads (priority order)

1. **[Orders persistence](orders-persistence.md)** — *5 anchors*
   Phase 2 follow-up. Move orders from in-memory `Map` to Prisma so they
   survive BFF restarts (today they reset on every boot). Cart stays
   in-memory by design. Critical files: `OrdersService`, `OrdersModule`,
   Prisma schema, `CheckoutService`, tests.

2. More coming — iterate on spec as Phase 2 stabilizes.

## Done

✅ **[Orchestrator wire-up](orchestrator.md)** — *0 anchors remaining*
   - Root `.env` centralizes all config (POSTGRES_USER, BFF_PORT, WEB_PORT, etc.)
   - `pnpm pg:up [core|web|viz|full]` with target profiles
   - `pnpm pg:dev` → docker compose watch (hot-reload for bff + web)
   - `pnpm pg:status` shows service health
   - Containerized web app + Dockerfile (Next.js standalone)
   - Auto-run `prisma migrate deploy` + `prisma db seed` on `pg:up`
   - Shell scripts shimmed to `pnpm pg:*` delegation
   - Development: `pnpm pg:dev:host` escape hatch for turbo run dev on host
