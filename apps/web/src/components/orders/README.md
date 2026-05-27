# `components/orders`

Order UI boundary.

The route components currently provide list, detail, status, total, lines,
and management actions (`cancel`, `update_status`, `mark_prepared`).

Orders are persisted through Prisma/PostgreSQL and are visible from the list
page after BFF restarts. Do not copy the cart's in-memory lifecycle notice
into order surfaces.
