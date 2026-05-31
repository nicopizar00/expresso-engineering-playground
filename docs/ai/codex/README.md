# Codex Prompts and Skills

Portable Codex guidance for the mini-commerce engineering playground.

This directory keeps repository-owned prompts and skills in the codebase while
leaving machine-local Codex defaults untouched. Use these files as source
material for Codex sessions, local skill installs, or future prompt updates.

## Contents

| File | Purpose |
|---|---|
| [governance.md](governance.md) | Repository governance frame formerly held at the root. |
| [current-findings.md](current-findings.md) | Active findings from the latest UAT and runtime analysis. |
| [design-governance-prompt.md](design-governance-prompt.md) | Prompt for conceptual architecture and scope framing. |
| [implementation-review-prompt.md](implementation-review-prompt.md) | Prompt for implementation-review and handoff work. |
| [manual-uat-prompt.md](manual-uat-prompt.md) | Prompt for manual UX UAT planning and execution. |
| [artistic-certification-prompt.md](artistic-certification-prompt.md) | Prompt for Codex-led visualizer artistic certification and Claude Code handoff. |
| [skills/](skills/) | Repo-local Codex skill definitions. |

## Usage

- Start with [governance.md](governance.md) for scope, authority, and durable
  repository rules.
- Read [current-findings.md](current-findings.md) before asking Codex to frame
  or review implementation work.
- Use [artistic-certification-prompt.md](artistic-certification-prompt.md) when
  Codex should judge Classic Expresso/Espresso, the standalone visualizer, the
  web embed, or commerce actions reflected in 3D while leaving implementation
  to Claude Code.
- Copy a prompt file into a Codex session when that mode of work is needed.
- Keep global Codex defaults in `$CODEX_HOME` or `~/.codex` unchanged unless
  the repository owner explicitly asks to install or update them.

## Repo-Local Skills

The skill folders under [skills/](skills/) follow the standard Codex skill
shape with `SKILL.md` and optional `agents/openai.yaml` metadata. They are
stored here for review and versioning. If a user wants them auto-discovered by
Codex, install or copy them into the local Codex skills directory outside this
repo as a separate, explicit step.
