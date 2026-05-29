# Architecture

This folder documents the architecture of the mini-commerce engineering
playground. The goal is to keep documentation **just ahead** of the code,
not behind it.

## Documents

- [`web-entry-point.md`](web-entry-point.md) — the web app as the single
  browser entry point and its internal proxy to the BFF and 3D visualizer.

## Documents (planned)

- `context.md`     — C4 Level 1: system context.
- `containers.md`  — C4 Level 2: containers (web, bff, db, otel).
- `components.md`  — C4 Level 3: modules inside the BFF (catalog, cart,
  checkout, orders, customers, notifications).
- `data-model.md`  — high-level domain entities and relationships.
- `events.md`      — domain events crossing module boundaries
  (order.placed, order.prepared, order.cancelled).
- `security.md`    — trust boundaries, auth model (fictional).

## Authoring rules

- No real company, product, or service names.
- No real URLs, IPs, or credentials.
- Diagrams are authored as Mermaid in the markdown files themselves — keep
  the source diff-able.

## Relationship to ADRs

This folder describes **the current state** of the architecture. ADRs in
[`../adr/`](../adr/README.md) describe **why we got here**. If a decision is
reversed, both must be updated: the architecture doc reflects the new state,
the ADR records why the previous decision was superseded.
