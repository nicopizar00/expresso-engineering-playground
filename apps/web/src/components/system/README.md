# `components/system`

Cross-cutting UI primitives that every domain folder consumes.

Planned components:
- `AppShell` — header + cart count badge + health badge + slot.
- `HealthBadge` — polls `expressoApi.getHealth()` on a slow interval.
- `LoadingSkeleton`, `EmptyState`, `ErrorBanner` — design-system primitives.

These are first in line for v0.app generation because every domain screen
needs them.
