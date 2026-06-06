## Claude Code Operating Protocol

Operational guide for using Claude Code in this repo. The execution rules
themselves live in [`claude/playbook.md`](claude/playbook.md); this file is
the **operating layer above it** — what configuration is shipped, how to
invoke it, when to spawn a subagent, and what the roadmap excludes.

## Scope of this protocol

- Primary AI implementation environment: **Claude Code**.
- This phase deliberately ships **no** GitHub Copilot, VS Code Copilot Chat,
  or Copilot prompt-file configuration beyond the existing tiny pointer at
  `.github/copilot-instructions.md`. See [Roadmap](#roadmap) below.

## Shipped configuration

```
CLAUDE.md                       — entry pointer (working agreements, fast paths)
.claude/skills/<name>/SKILL.md  — user-invokable workflows
.claude/agents/<name>.md        — read-only review subagents
.claude/commands/<name>.md      — short slash-command workflows
.claude/settings.local.json     — local permission grants (not committed beyond
                                  what already exists)
docs/ai/claude/playbook.md      — execution rules (validation matrix, guardrails)
docs/ai/tooling-efficiency.md   — subagent picks, parallel calls, /loop, memory
docs/performance/orchestrator.md
                                — design of the Python-first k6 Docker layer
docs/performance/validation.md  — performance validation evidence rules
```

## Skills (user-invokable)

Invoke with `/expresso-<name>` or via the Skill tool. Each lives at
`.claude/skills/<name>/SKILL.md`.

| Skill | When to invoke |
|---|---|
| `expresso-repo-orientation` | Cold session start. Builds the mental model. |
| `expresso-performance-orchestrator` | Designing or extending the Python-first k6 Docker layer. |
| `expresso-k6-review` | Reviewing a new or modified k6 scenario / threshold. |
| `expresso-docker-compose-review` | Reviewing Compose changes (profiles, ports, volumes). |
| `expresso-visualizer-review` | Reviewing `scene.js` against the PS1 art rules. |
| `expresso-validation-audit` | Before reporting a change "done". |
| `expresso-documentation-audit` | When docs are touched or a code change crosses an architecture spoke. |

## Subagents (Claude-spawned, read-only)

Spawn via the Agent tool with `subagent_type=<name>`. All three are
read-only — they audit and report; they do not edit.

| Subagent | Reach for it when |
|---|---|
| `performance-engineering-reviewer` | A second opinion on a perf change before merging. |
| `python-orchestrator-reviewer` | Reviewing `scripts/pg/` correctness, stdlib-only, entry-point parity. |
| `threejs-visual-design-reviewer` | Reviewing `scene.js` art compliance and SSE boundary. |

## Slash commands

Short, repeatable workflows under `.claude/commands/`.

| Command | What it does |
|---|---|
| `/perf-smoke` | Runs the k6 smoke scenario through Docker, summarizes the result. |
| `/validate-change` | Picks the narrowest validation row from the playbook matrix and runs it. |

## Subagent picks at a glance

| Situation | Use |
|---|---|
| Find one known symbol / file | `Bash` (`grep`/`find`) directly |
| Survey unknown code (≥ 3 lookups) | `Explore` subagent |
| Design before edit (multi-file) | `EnterPlanMode` → `Plan` subagent |
| Independent multi-step research | `general-purpose` agent |
| One-shot edit on a known file | None — direct `Edit` |
| Cross-cutting review of perf change | `performance-engineering-reviewer` |
| Cross-cutting review of orchestrator change | `python-orchestrator-reviewer` |
| Cross-cutting review of scene change | `threejs-visual-design-reviewer` |

Full guidance: [`tooling-efficiency.md`](tooling-efficiency.md).

## Conventions enforced by this protocol

1. **No AI attribution** in committed content (commits, PRs, docs).
2. **English-only** committed content; chat may be Spanish.
3. **No real names, URLs, IPs, or credentials** — domain is fictional.
4. **Architecture spokes are canonical.** Skills, agents, and commands link
   to `docs/architecture/**` and `docs/performance/**`; they do not restate
   them.
5. **Validation is local-first.** `/validate-change` runs the narrowest
   playbook row; CI is a backstop, not the gate for "done".
6. **Read-only agents are the default for review.** Spawn an editing agent
   only when the user explicitly asks for edits.

## Roadmap

Out of scope for this phase, deferred to a future track:

- VS Code + GitHub Copilot Chat configuration (instructions files,
  prompt files, Copilot-specific skills).
- A second Copilot pointer at `.github/copilot-instructions.md` beyond the
  current tiny pointer.
- CI gating for performance scenarios. The orchestrator and scenario
  library are local-first today; promoting a scenario to a CI gate happens
  per-scenario, in a separate change, with explicit owner sign-off.
- Multi-repo / multi-service performance workflows. The orchestrator stays
  monorepo-internal until a second target needs it.

## Related

- [`claude/playbook.md`](claude/playbook.md) — execution rules.
- [`tooling-efficiency.md`](tooling-efficiency.md) — efficient tool use.
- [`../performance/orchestrator.md`](../performance/orchestrator.md) —
  the performance orchestration design.
- [`../performance/validation.md`](../performance/validation.md) — perf
  validation evidence rules.
