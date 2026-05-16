# View-model adapters

Pure functions that map BFF wire-format responses
(`apps/web/src/lib/api/expresso-api.ts`) into the props that v0.app-generated
components consume.

Why this layer exists:
- v0 components must not import BFF DTOs directly. If the API shape changes,
  the fix happens here, not across every screen.
- View models can pre-format money, compute derived fields (e.g.
  `outOfStock`), and pick currency-safe display strings.

Naming: one file per domain — `productVM.ts`, `cartVM.ts`, `orderVM.ts`,
`healthVM.ts`. Each exports `to<Thing>VM(dto)` returning a plain object.

This directory is **intentionally empty** until the first v0 component lands.
