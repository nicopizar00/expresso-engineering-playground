# `components/system`

Cross-cutting UI primitives consumed by the current domain screens.

Current components:
- `AppShell` — header + cart count badge + health badge + slot.
- `HealthBadge` — polls `expressoApi.getHealth()` on a slow interval.
- `LoadingSkeleton`, `EmptyState`, `ErrorBanner` — design-system primitives.

Future design passes may refine these primitives, but must preserve their
hand-wired health and cart data boundaries.
