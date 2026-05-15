# Architecture Decision Records

This folder records significant architecture decisions and their context.

## Conventions

- One file per decision: `NNNN-short-kebab-title.md`, zero-padded to four
  digits.
- Start every ADR from [`0000-template.md`](./0000-template.md).
- ADRs are **append-only**. If a decision is reversed, write a new ADR that
  supersedes the old one (and update the old one's status).
- Keep ADRs short. If a section needs more than a few paragraphs, link out
  to an architecture document or RFC.

## Status values

- `Proposed`    — open for discussion.
- `Accepted`    — decided and in effect.
- `Superseded`  — replaced by a later ADR (link forward).
- `Deprecated`  — no longer in effect, but kept for history.

## Index

- [0001 — Monorepo + pnpm + Turborepo](./0001-monorepo-and-tooling.md) — Accepted
- [0002 — Adopt a mini-commerce domain for the playground](./0002-mini-commerce-domain.md) — Accepted
