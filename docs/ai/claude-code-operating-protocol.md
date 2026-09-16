## Claude Code Operating Protocol

Operational guide for using Claude Code in this repo. The execution rules
themselves live in [`claude/playbook.md`](claude/playbook.md); this file is
the **operating layer above it** — the shared conventions, validation
expectations, and roadmap boundaries.

## Scope of this protocol

- Primary AI implementation environment: **Claude Code**.
- This phase deliberately ships **no** GitHub Copilot, VS Code Copilot Chat,
  or Copilot prompt-file configuration beyond the existing tiny pointer at
  `.github/copilot-instructions.md`. See [Roadmap](#roadmap) below.

## Shipped configuration

```
CLAUDE.md                       — entry pointer (working agreements, fast paths)
.claude/settings.local.json     — local permission grants (not committed beyond
                                  what already exists)
docs/ai/claude/playbook.md      — execution rules (validation matrix, guardrails)
docs/ai/tooling-efficiency.md   — subagent picks, parallel calls, /loop, memory
docs/performance/orchestrator.md
                                — design of the Python-first k6 Docker layer
docs/performance/validation.md  — performance validation evidence rules
```

The repository does not ship project-specific Claude Code skills, commands,
or agents. Use the canonical documentation and the standard Claude Code tools
directly.

## Subagent picks at a glance

| Situation | Use |
|---|---|
| Find one known symbol / file | `Bash` (`grep`/`find`) directly |
| Survey unknown code (≥ 3 lookups) | `Explore` subagent |
| Design before edit (multi-file) | `EnterPlanMode` → `Plan` subagent |
| Independent multi-step research | `general-purpose` agent |
| One-shot edit on a known file | None — direct `Edit` |

Full guidance: [`tooling-efficiency.md`](tooling-efficiency.md).

## Conventions enforced by this protocol

1. **No AI attribution** in committed content (commits, PRs, docs).
2. **English-only** committed content; chat may be Spanish.
3. **No real names, URLs, IPs, or credentials** — domain is fictional.
4. **Architecture spokes are canonical.** Use `docs/architecture/**` and
   `docs/performance/**` rather than restating their rules elsewhere.
5. **Validation is local-first.** Run the narrowest applicable playbook row;
   CI is a backstop, not the gate for "done".
6. **Performance workflows are consumer-owned YAML.** The seven Expresso
   workflow files select the scenario and permitted environment; Punch owns
   loading, confirmation, one Compose run, stream logging, and optional CSV
   publication. Install `vendor/punch/requirements.txt` before `perf:*` work.
   `outputs.csv` is optional; its exact stdout `[CSV]` records require
   confirmation, fail on zero records, and publish atomically. CI's smoke
   workflow builds first and invokes `./dev perf:smoke` rather than duplicating
   the Compose command.

## Roadmap

Out of scope for this phase, deferred to a future track:

- VS Code + GitHub Copilot Chat configuration (instructions files,
  prompt files, Copilot-specific skills).
- A second Copilot pointer at `.github/copilot-instructions.md` beyond the
  current tiny pointer.
- CI coverage beyond the CI smoke workflow. The smoke workflow is the
  explicitly owned baseline; promoting another scenario still needs explicit
  owner sign-off.
- Multi-repo / multi-service performance workflows. The orchestrator stays
  monorepo-internal until a second target needs it.

## Related

- [`claude/playbook.md`](claude/playbook.md) — execution rules.
- [`tooling-efficiency.md`](tooling-efficiency.md) — efficient tool use.
- [`../performance/orchestrator.md`](../performance/orchestrator.md) —
  the performance orchestration design.
- [`../performance/validation.md`](../performance/validation.md) — perf
  validation evidence rules.
