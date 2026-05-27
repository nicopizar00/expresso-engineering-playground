# `components/catalog`

Catalog presentation components integrated into the web storefront.

Current components:
- `ProductCatalogGrid` — renders the catalog page content.
- `ProductCard` and `ProductQuickView` — present products and dispatch
  add-to-cart through shared cart state.

Rules:
- No `fetch` calls inside these components; the API client and cart hook own
  network behavior.
- Use the canonical contract shapes through existing frontend boundaries;
  do not redeclare BFF responses in visual components.
