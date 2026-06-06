---
name: expresso-documentation-audit
description: Use to confirm docs touched by a change remain practical, current, and aligned with the code. Enforces the architecture-spoke rule, the no-AI-attribution rule, and the docs/next-steps anchor convention.
---

# Expresso — Documentation Audit

## When to use

- When a change updates `docs/**/*.md` or invalidates a fact previously
  documented there.
- When closing a `docs/next-steps/<topic>.md` thread.
- When a code change crosses a documented architecture boundary
  (containers, BFF modules, web entry point, OTel pipeline, orchestrator).

## Read first

- `docs/README.md` — documentation hub.
- `docs/ai/README.md` — assistant roster + shared rules.
- `docs/architecture/` — canonical spokes (containers, bff-modules,
  web-entry-point, observability, orchestrator-python).
- `docs/next-steps/README.md` — open threads.
- The doc(s) the change touched.

## Hub-and-spoke rule

The architecture docs under `docs/architecture/` are the **canonical
spokes** for their topic. Other docs (CLAUDE.md, playbook, copilot pointer,
skills here, READMEs) link to them; they do not restate them. If a change
makes a spoke obsolete, update the spoke — do not duplicate content in a
new file.

## Audit checklist

- [ ] No AI attribution anywhere committed (`Co-Authored-By: Claude`,
      `Generated with Claude`, "by an AI", etc.).
- [ ] English-only committed content.
- [ ] No real names, real URLs, real IPs, real credentials. Domain stays
      fictional.
- [ ] Facts that changed in code are mirrored in the spoke (ports, profiles,
      module rules, validation matrix).
- [ ] `docs/next-steps/<topic>.md` is updated, closed, or migrated to the
      Done list in `docs/next-steps/README.md` if the change finishes the
      thread.
- [ ] Source anchors `TODO(next-steps/<topic>)` are removed when the topic
      closes; the count in `docs/next-steps/README.md` matches reality.
- [ ] Links resolve (relative paths consistent with the file's location).
- [ ] Mermaid diagrams render (no unclosed code fences, valid syntax).

## Output

- Doc files audited.
- Findings tagged `blocker` / `should-fix` / `nit`.
- The smallest set of doc edits that closes each finding.
- Whether any spoke needs an update that the change skipped.

## Don'ts

- Do not create new top-level docs to capture content that belongs in an
  existing spoke.
- Do not write speculative roadmap docs without an owner-approved
  `docs/next-steps/<topic>.md`.
- Do not soften an invariant ("usually", "tend to") when the code enforces
  it strictly — the doc should state it strictly.
