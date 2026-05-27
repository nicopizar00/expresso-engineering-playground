# Web-app local types

UI-only types that do not belong in `@mini-commerce/contracts` (those are
the wire format) or `@mini-commerce/shared-types` (those are domain types).

Examples of what lives here:
- View-model output types (paired with `lib/view-models/*`).
- Component prop types that are reused across components.
- Form-state types for checkout / order-manage flows.

Avoid:
- Redeclaring BFF response shapes — import them from
  `@mini-commerce/contracts`, directly or through the API client's
  intentional re-exports.
