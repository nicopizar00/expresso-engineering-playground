# AI Governance Hub

> Single entry point for any AI assistant working on this repo. Each
> assistant has a **lane**; this file tells you which lane your task belongs
> in and where its rules live.

## Assistant roster

| Assistant | Scope | Lane | Loaded by |
|---|---|---|---|
| **Claude Code** (CLI / API tool-use) | Implementation, runtime validation, repo edits | [`claude/playbook.md`](claude/playbook.md) | `CLAUDE.md` (root) |
| **Claude** (chat / pairing) | Review, prompt design, exploration | [`claude/README.md`](claude/README.md) | manual paste |
| **Codex** (chatgpt.com / CLI) | Conceptual design, scope framing, governance review | [`codex/governance.md`](codex/governance.md) | repo-local skill or paste |
| **GitHub Copilot** (IDE inline) | Tab-complete suggestions during editing | [`../../.github/copilot-instructions.md`](../../.github/copilot-instructions.md) (pointer only) | IDE auto-load |
| **v0.app** | Frontend visual direction & design exploration | governed by Codex frame | manual |
| **Vercel Agent / others** | Out of scope unless owner opts in | n/a | n/a |

## Which AI for which job

```mermaid
flowchart TD
  Task([Task arrives]) --> Kind{"What kind?"}

  Kind -->|"Scope / direction /<br/>'should we build this'"| Codex["Codex<br/>codex/governance.md"]
  Kind -->|"Code change / refactor /<br/>bug fix / runtime validation"| ClaudeCode["Claude Code<br/>claude/playbook.md"]
  Kind -->|"Conceptual help, code review,<br/>pair programming"| ClaudeChat["Claude (chat)<br/>claude/README.md"]
  Kind -->|"Frontend visual exploration"| V0["v0.app<br/>(scope-bounded by Codex)"]
  Kind -->|"IDE inline completion"| Copilot["Copilot<br/>.github/copilot-instructions.md"]

  Codex -->|"Direction set"| ClaudeCode
  V0 -->|"Design → wire-up"| ClaudeCode
  ClaudeChat -.->|"Pair with"| ClaudeCode

  classDef impl fill:#fff5e6,stroke:#c47a2a,color:#000;
  classDef gov fill:#eef6ff,stroke:#2a6fc4,color:#000;
  classDef ide fill:#f5f5f5,stroke:#999,color:#444;
  class ClaudeCode,V0 impl;
  class Codex,ClaudeChat gov;
  class Copilot ide;
```

## Shared rules across all assistants

1. **No AI attribution** in committed content (commit messages, PRs, docs).
2. **English** for committed content; conversation may happen in Spanish.
3. **No real names**, URLs, IPs, or credentials — domain is fictional.
4. **Repository owner is the only final authority** on direction, merges,
   acceptance.

Full statement: [`codex/governance.md`](codex/governance.md) §Authority.

## Tooling efficiency

[`tooling-efficiency.md`](tooling-efficiency.md) — subagent choice, parallel
tool calls, `/loop` cadence, memory rules. Tuned for usage-billed sessions;
applies to any tool-using LLM in this repo.

## Related

- Documentation hub: [`../README.md`](../README.md)
- Claude lane: [`claude/`](claude/)
- Codex lane: [`codex/`](codex/)
- Architecture spokes (the substrate every assistant should link to instead of
  duplicating): [`../architecture/`](../architecture/)
