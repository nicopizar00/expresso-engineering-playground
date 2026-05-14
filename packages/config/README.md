# @travel-playground/config

Shared, opinionated configuration consumed by every workspace package.

Planned contents:

- `eslint/` — base + per-target ESLint presets (Node, Next.js, tests).
- `tsconfig/` — `tsconfig` presets layered on top of `tsconfig.base.json`.
- `prettier/` — single shared Prettier config.

Today this package is a placeholder. Configs live at the root
(`tsconfig.base.json`, `.editorconfig`) until the matrix justifies extraction.
