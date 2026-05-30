# 0004. React hydration errors (#418/#423) seen in UAT are environmental, not a release blocker

- **Status:** Accepted
- **Date:** 2026-05-29
- **Deciders:** Repository owner (validation by Claude Code)
- **Supersedes:** _(none)_
- **Superseded by:** _(none)_

## Context

During realistic web UAT of branch `refactor/domain-events-seam` (commit `8739942`),
the storefront was driven in a real browser with demo mode off and no network
mocks. Catalog, header, category filters, and product quick view passed
functionally, but the browser console recorded repeated uncaught React
production errors during the catalog/quick-view flows:

- **Minified React error #418** — hydration failed: server-rendered HTML did not
  match the client's first render.
- **Minified React error #423** — React recovered by client-rendering the entire
  root.

Per the UAT acceptance rule "no uncaught console errors during the flows," the
run was correctly stopped: no cleanup, no PR, no merge. Original evidence:
`/private/tmp/expresso-uat-20260529-branch-domain-events/console-errors.json`
plus screenshots in the same directory.

This decision resolves a single question: are these errors a defect in the
branch (a release blocker), or an artifact of the test environment? Note that
the domain-events refactor is BFF-only — `apps/web` is byte-identical between
`8739942` and the branch used for this analysis, so the frontend under test is
unambiguous.

## Decision

Treat the #418/#423 hydration errors as an **environmental artifact — pre-hydration
DOM mutation by a browser extension in the real-Chrome UAT session — not an
application defect and not a release blocker.** The branch frontend is
hydration-safe; the console gate must be evaluated in a clean browser context
(no extensions) such as an incognito profile or the Preview/Playwright Chromium.

## Evidence

1. **Static analysis.** The SSR render path (layout -> CartProvider/AppShell ->
   CatalogPage) is hydration-safe: client-only state uses `useState` +
   `useEffect`; no `Date`/`Math.random`/`window`/`localStorage` is read during
   render; the catalog loading skeleton is deterministic; there is no invalid
   interactive-element nesting.
2. **SSR output** (`curl` of the production server on `:3000`): `<body>` is
   served with zero attributes and `<html lang="en">`; the page server-renders
   the deterministic 6-card skeleton with no product data, timestamps, or demo
   banner.
3. **Clean-browser reproduction** (Chromium without extensions, demo off, real
   BFF): `body`/`html` attributes match the SSR baseline (no injected
   attributes), 7 products hydrate, and the console is empty through catalog and
   quick view — the exact flows where the blocker was reported — including in
   development mode, which prints hydration mismatches verbosely.
4. **Automated e2e** (Playwright, clean Chromium): 16/16 pass across the same
   flows with no hydration errors.

The recorded stacks are minified and contain only React-internal frames
(scheduler / `MessagePort`) with no application component — the signature of a
root-level mismatch caused by external DOM mutation before hydration (e.g.
Grammarly, dark-reader, password managers), not by application code.

## Consequences

- The branch is cleared of this blocker; the validated changes (frontend UX/a11y
  fixes, visualizer fix, domain-events decoupling) may proceed.
- The UAT process must specify a clean browser context so the "no console errors"
  gate measures the application, not the tester's browser. The manual UAT skill
  and prompt should be updated to require incognito / extensions disabled (or the
  Preview/Playwright Chromium) and to classify extension-injected hydration noise
  as a non-blocking, environment-tagged observation.
- Optional hardening (not required and not a substitute for a clean environment):
  `<body suppressHydrationWarning>` only masks body-level extension noise and
  would hide genuine future mismatches, so it is intentionally not adopted.

## Alternatives considered

- **Treat as a code blocker and patch the frontend.** Rejected: no app-level
  mismatch exists, so there is nothing correct to change; `suppressHydrationWarning`
  would suppress real future regressions.
- **Override the gate without analysis.** Rejected: that violates the governance
  expectation that a red gate is converted into an informed, evidence-backed
  decision rather than ignored.
