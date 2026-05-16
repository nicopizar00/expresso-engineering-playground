# `components/catalog`

v0.app-generated catalog UI lands here.

Planned components:
- `ProductCatalogGrid` — replaces today's `CatalogCard` in `app/page.tsx`.
- `ProductDetailPanel` — fed by `expressoApi.getProductById(id)` via
  `productDetailVM`.

Rules:
- Consume `productVM` output from `src/lib/view-models/` — never the raw
  `Product` DTO.
- No `fetch` calls inside these components; route components or hooks own
  the network.
