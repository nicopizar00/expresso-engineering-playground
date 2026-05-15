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

1. **[Orchestrator wire-up](orchestrator.md)** — *3 anchors*
   Make `pnpm pg:*` the single canonical interface: containerize web, add
   compose profiles, wire `prisma migrate`/`db seed` into `pg:up`,
   centralize env, retire `scripts/*.sh`. Resolves the host/container
   port-3001 collision class of bugs.

2. **[Orders persistence](orders-persistence.md)** — *3 anchors*
   Phase 2 follow-up. Move orders from in-memory `Map` to Prisma so they
   survive BFF restarts (today they reset on every boot). Cart stays
   in-memory by design.

## Done

_(none yet — entries land here as topics close)_
