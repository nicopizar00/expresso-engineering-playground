# HTTP API reference

> Status: Reviewed against HEAD 800ac16 by a fresh reader.

This reference covers the 20 live BFF HTTP and SSE routes at commit `800ac16506b91b3d69ca852f9098a106e865692e`. Drift anchors: `apps/bff/src/modules/`, `apps/bff/src/core/`, `apps/bff/src/common/`, `apps/bff/src/main.ts`, and `apps/bff/src/routes.spec.ts`. Count routes from the pinned source with `rg -n '@(Get|Post|Patch|Delete|Sse)\(' apps/bff/src -g '*.controller.ts'`.

## Shared HTTP behavior

All routes are served at their listed paths. Successful GET, PATCH, and DELETE requests return HTTP 200. POST status codes are listed per route. Cross-origin requests use the configured origin, but the BFF does not enable CORS credentials.

The global validation pipe transforms values, strips no unknown properties silently, and rejects unknown properties. Body fields with DTO validation rules are checked before handlers run. Invalid input returns HTTP 400 through the common error envelope. The envelope's `error` value preserves framework response objects, including `message` and `field` when a service supplies them.

| Error field  | Type                     | Meaning                                                                                                              | Usage                                                                                             |
| ------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `statusCode` | number                   | HTTP status code.                                                                                                    | Use for machine-level handling.                                                                   |
| `path`       | string                   | Request URL, including its query string when present.                                                                | Use to identify the failed request.                                                               |
| `method`     | string                   | HTTP method.                                                                                                         | Use with `path` to identify the failed request.                                                   |
| `error`      | object or string wrapper | Framework error response. String messages are represented as `{ "message": "..." }`; object responses are preserved. | Inspect `message` for display or diagnostics and `field` when present for field-level validation. |

Unhandled exceptions return status 500 and message `Internal server error`. Errors with status 500 or higher are logged by the BFF. Error responses do not include a trace identifier.

The BFF reads `sid` and `auth` from the Cookie header. Cookie values are URI-decoded; empty or malformed values are treated as absent. Newly issued cookies use `Path=/`, `HttpOnly`, and `SameSite=Lax`; `Secure` depends on the request protocol being HTTPS. Auth clearing specifies only `Path=/` and does not repeat the minting attributes. An existing nonempty `sid` is accepted without UUID validation.

| Cookie | Set or cleared by                                                                    | Contract                                                                                                                                                                              | Usage                                                              |
| ------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `sid`  | Cart and session-order requests set it when absent.                                  | A generated UUID identifies the anonymous cart and guest orders. It has no configured expiry.                                                                                         | Preserve it across cart and guest-order requests.                  |
| `auth` | Registration and login set it; logout and unknown or expired token lookups clear it. | An opaque token identifies a database-backed sign-in session. Its maximum age matches the configured session lifetime. Empty or malformed cookies resolve as absent without clearing. | Send it for signed-in account requests and self-directed checkout. |

## Route summary

| Method and path              | Purpose                                         | Authentication or session                               | Usage                                               |
| ---------------------------- | ----------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------- |
| `GET /health`                | Report BFF health metadata.                     | None.                                                   | Poll for basic process health.                      |
| `GET /products`              | List products.                                  | None.                                                   | Load the catalog.                                   |
| `GET /products/:id`          | Fetch one product.                              | None.                                                   | Load a product by product ID.                       |
| `GET /cart`                  | Read the caller's cart.                         | Anonymous `sid`, created if absent.                     | Retrieve cart state before editing or checkout.     |
| `POST /cart/items`           | Add a product to the cart.                      | Anonymous `sid`, created if absent.                     | Add one product and quantity.                       |
| `PATCH /cart/items/:itemId`  | Change an item's quantity.                      | Anonymous `sid`, created if absent.                     | Update one existing cart item.                      |
| `DELETE /cart/items/:itemId` | Remove a cart item.                             | Anonymous `sid`, created if absent.                     | Remove one existing cart item.                      |
| `POST /orders`               | Check out the current cart.                     | Anonymous `sid`; optional `auth`.                       | Create an order from the reserved cart.             |
| `GET /orders`                | List all orders or the caller's session orders. | No session for all orders; `sid` for session filtering. | Omit `owner` for all orders or set `owner=session`. |
| `GET /orders/:id`            | Fetch one order.                                | None.                                                   | Retrieve order details.                             |
| `GET /orders/:id/status`     | Fetch current order temperature status.         | None.                                                   | Refresh the status of one order.                    |
| `GET /me`                    | Resolve the current signed-in user.             | Optional `auth`.                                        | Bootstrap signed-in UI state.                       |
| `GET /me/orders`             | List the signed-in user's orders.               | Required `auth`.                                        | Show account order history.                         |
| `GET /me/hot-status`         | Summarize the user's currently hot orders.      | Required `auth`.                                        | Refresh the hot-order banner.                       |
| `POST /auth/register`        | Create an account and sign in.                  | None.                                                   | Register with username, email, and password.        |
| `POST /auth/login`           | Sign in.                                        | None.                                                   | Sign in with username or email and password.        |
| `POST /auth/logout`          | End the current sign-in session.                | Optional `auth`.                                        | Clear the current sign-in cookie.                   |
| `GET /visualization`         | Return the visualization snapshot.              | None.                                                   | Load the initial scene and compatibility items.     |
| `GET /visualization/events`  | Stream visualization snapshots.                 | None.                                                   | Maintain a live visualization connection.           |
| `POST /assets/refresh`       | Reload asset configuration and model caches.    | No route-level authentication.                          | Request an asset cache refresh.                     |

## Health and catalog

### `GET /health`

Returns HTTP 200 with a process health report. The database check is currently `skipped`.

| Response field  | Type or values                                          | Usage                                         |
| --------------- | ------------------------------------------------------- | --------------------------------------------- |
| `status`        | `"ok"`                                                  | Treat as the process health result.           |
| `service`       | `"bff"`                                                 | Identify the reporting service.               |
| `version`       | string, default `"0.0.0"`                               | Display or record the configured BFF version. |
| `uptimeSeconds` | nonnegative integer                                     | Observe process uptime.                       |
| `checks.db`     | `"skipped"`, `"ok"`, or `"down"`; currently `"skipped"` | Read the database check state.                |

### `GET /products` and `GET /products/:id`

The list route returns `{ "items": [...] }`. The item route returns one product directly. Both return products from the catalog.

| Product field       | Type or values                        | Usage                                           |
| ------------------- | ------------------------------------- | ----------------------------------------------- |
| `productId`         | string                                | Use as the product identifier in cart requests. |
| `sku`               | string                                | Display or match the stock keeping unit.        |
| `name`              | string                                | Display the product name.                       |
| `description`       | string                                | Display product details.                        |
| `category`          | `"drink"`, `"food"`, or `"accessory"` | Classify the product.                           |
| `price.amountMinor` | integer                               | Treat as the amount in minor currency units.    |
| `price.currency`    | string                                | Interpret the amount using this currency code.  |

`GET /products/:id` returns 404 when the product does not exist. The `:id` path segment is the product's `productId`.

## Cart

All cart routes resolve the anonymous session from `sid` and set the cookie if no usable value is present. An empty cart has `cartId: null` and `expiresAt: null`.

| Cart response field | Type                                                  | Usage                                                         |
| ------------------- | ----------------------------------------------------- | ------------------------------------------------------------- |
| `cartId`            | UUID string or `null`                                 | Send the current value to checkout. A reservation can expire. |
| `items`             | array of cart items                                   | Render the cart contents.                                     |
| `items[].itemId`    | string                                                | Use in item update and delete paths.                          |
| `items[].productId` | string                                                | Identify the catalog product.                                 |
| `items[].name`      | string                                                | Display the item name.                                        |
| `items[].unitPrice` | Money object                                          | Display one unit's price.                                     |
| `items[].quantity`  | integer                                               | Display the selected quantity.                                |
| `items[].lineTotal` | Money object                                          | Display the quantity-adjusted price.                          |
| `itemCount`         | number                                                | Display the total item quantity.                              |
| `total`             | Money object                                          | Display the cart total.                                       |
| `expiresAt`         | ISO date-time string or `null`                        | Inform the caller when the current reservation expires.       |
| `updatedAt`         | fixed ISO date-time string `2026-05-14T12:00:00.000Z` | Treat as a placeholder, not a mutation timestamp.             |
| Money `amountMinor` | integer                                               | Treat as a minor currency unit amount.                        |
| Money `currency`    | string                                                | Interpret the amount.                                         |

### `GET /cart`

Returns the current cart directly. It takes no query parameters or body.

### `POST /cart/items`

Returns the updated cart with HTTP 201.

| Request field | Type and constraints                                                           | Usage                        |
| ------------- | ------------------------------------------------------------------------------ | ---------------------------- |
| `productId`   | required string                                                                | Identify the product to add. |
| `quantity`    | required integer from 1 through 20; numeric strings are transformed to numbers | Set the quantity to add.     |

The cart currently accepts only quantity `1`; other values that pass DTO validation return 400. A cart that already contains its one allowed item returns 409. An unknown product returns 404.

### `PATCH /cart/items/:itemId`

Returns the updated cart. The `itemId` path segment selects the cart item.

| Request field | Type and constraints                                                           | Usage                        |
| ------------- | ------------------------------------------------------------------------------ | ---------------------------- |
| `quantity`    | required integer from 1 through 20; numeric strings are transformed to numbers | Set the item's new quantity. |

An unknown item returns 404. Changing the quantity of an existing item returns 409 because the selected item cannot be changed.

### `DELETE /cart/items/:itemId`

Returns the updated cart. The `itemId` path segment selects the cart item. It takes no body.

An unknown item returns 404. Removing an existing selected item returns 409.

## Orders and checkout

### `POST /orders`

Creates an order from the caller's current cart and returns HTTP 201. The request must include the cart reservation ID. A mismatched nonempty reservation returns 409. An expired reservation is cleared before checkout and returns 400 because the cart is empty. A stale or invalid `auth` cookie is treated as a guest session.

| Request field        | Type and constraints                | Usage                                                                                                               |
| -------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `cartId`             | required UUID string                | Submit the reservation ID returned by the latest cart response.                                                     |
| `idempotencyKey`     | optional UUID string                | Reuse the same key on retry to receive the original order instead of creating another.                              |
| `orderFor`           | optional object                     | Select the recipient behavior. When omitted, a signed-in caller orders for self and a guest caller orders as guest. |
| `orderFor.type`      | `"self"`, `"guest"`, or `"user"`    | Select self, guest, or a named recipient.                                                                           |
| `orderFor.recipient` | optional string, max 300 characters | For `type: "user"`, provide a username or email. The recipient need not have an account.                            |

`type: "self"` requires a signed-in user and otherwise returns 401. `type: "user"` applies the registration username and email normalization rules to its recipient. Account-rule failures return 400 with `field: "recipient"`; DTO failures use the shared validation envelope. An unrecognized body property, including `customerName`, returns 400.

An empty cart returns 400. A replay with a known idempotency key returns the original order details before recipient and cart checks. Keys are global, with no caller ownership check. Replay echoes the retry request's `cartId`; it does not recover a stored reservation ID. Optional fields also accept `null` as absent under DTO validation.

| Response field      | Type                 | Usage                                                          |
| ------------------- | -------------------- | -------------------------------------------------------------- |
| `orderId`           | string               | Use to fetch order details or status.                          |
| `cartId`            | UUID string          | Read the request's echoed reservation ID, including on replay. |
| `customerName`      | string or `null`     | Display the order's customer name when present.                |
| `total.amountMinor` | integer              | Treat as a minor currency unit amount.                         |
| `total.currency`    | string               | Interpret the total amount.                                    |
| `placedAt`          | ISO date-time string | Display or sort by order placement time.                       |

### `GET /orders`

Returns `{ "items": [...] }` ordered by placement time, newest first. With no `owner` query parameter, it returns all orders. With `owner=session`, it returns orders associated with the caller's `sid` and creates that cookie when needed. Any other value, an empty value, or repeated `owner` parameters returns 400.

| Query parameter | Type and values              | Usage                                                                               |
| --------------- | ---------------------------- | ----------------------------------------------------------------------------------- |
| `owner`         | omitted or exactly `session` | Omit to list all orders. Set to `session` to list orders for the anonymous session. |

### `GET /orders/:id`

Returns one order directly, or 404 if the ID is unknown.

| Order field         | Type                               | Usage                                           |
| ------------------- | ---------------------------------- | ----------------------------------------------- |
| `orderId`           | string                             | Identify the order.                             |
| `customerName`      | string or `null`                   | Display the customer name when present.         |
| `owner`             | object or `null`                   | Identify an account recipient when present.     |
| `owner.username`    | string, present for username owner | Display or match the owning username.           |
| `owner.email`       | string, present for email owner    | Display or match the owning email.              |
| `lines`             | array of order lines               | Render purchased items.                         |
| `lines[].productId` | string                             | Identify the product.                           |
| `lines[].name`      | string                             | Display the item name at order time.            |
| `lines[].quantity`  | number                             | Display the purchased quantity.                 |
| `lines[].unitPrice` | Money object                       | Display the captured unit price.                |
| `lines[].lineTotal` | Money object                       | Display the captured line total.                |
| `total`             | Money object                       | Display the order total.                        |
| `placedAt`          | ISO date-time string               | Display the placement time.                     |
| `updatedAt`         | ISO date-time string               | Track the latest order update.                  |
| `temperature`       | `"hot"` or `"cold"`                | Display current derived order temperature.      |
| `coolsAt`           | ISO date-time string               | Display when the order leaves the hot interval. |

Each Money object has `amountMinor` as an integer and `currency` as a string. Use the currency to interpret the amount.

### `GET /orders/:id/status`

Returns the current status projection for an order, or 404 if its ID is unknown. The status read queries PostgreSQL directly. An order is hot while its age is strictly below the cooling interval and cold at the boundary.

| Response field | Type                 | Usage                                     |
| -------------- | -------------------- | ----------------------------------------- |
| `orderId`      | string               | Identify the order.                       |
| `temperature`  | `"hot"` or `"cold"`  | Display the current derived temperature.  |
| `placedAt`     | ISO date-time string | Show when the order was placed.           |
| `coolsAt`      | ISO date-time string | Show the end of the hot interval.         |
| `checkedAt`    | ISO date-time string | Determine when this status was evaluated. |

### `GET /me/orders`

Returns `{ "items": [...], "latest": ... }` for the signed-in user. Without a valid sign-in session, it returns 401.

| Response field | Type                   | Usage                                                                                    |
| -------------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| `items`        | array of order objects | Render the account's order history. Each item follows the `GET /orders/:id` order shape. |
| `latest`       | order object or `null` | Highlight the first item, or show no latest order when the list is empty.                |

### `GET /me/hot-status`

Returns a summary for the signed-in user's hot orders. Without a valid sign-in session, it returns 401.

| Response field | Type                           | Usage                                                                                |
| -------------- | ------------------------------ | ------------------------------------------------------------------------------------ |
| `hotCount`     | number                         | Display the number of currently hot orders.                                          |
| `nextCoolsAt`  | ISO date-time string or `null` | Display the earliest cooling time, or omit a countdown when there are no hot orders. |
| `serverTime`   | ISO date-time string           | Compare against the client clock when calculating countdowns.                        |

## Authentication

### `POST /auth/register`

Creates an account, starts a sign-in session, sets the `auth` cookie, and returns HTTP 201 with the public user. Username, email, and password are normalized or validated by account rules. Duplicate username or email returns 409 with a `field` identifying the conflicting value. Invalid identity fields return 400 with `field`.

| Request field | Type and constraints                                                                                                                                                               | Usage                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `username`    | required string, at most 300 characters at DTO validation; account rule accepts 3 to 32 characters from lowercase letters, digits, dot, underscore, and hyphen after normalization | Choose the account username. |
| `email`       | required string, at most 300 characters at DTO validation; trimmed and lowercased value must be at most 254 characters and match the account email pattern                         | Set the account email.       |
| `password`    | required string, at most 300 characters at DTO validation; account rule accepts 8 to 200 characters without trimming or case conversion                                            | Set the account password.    |

### `POST /auth/login`

Starts a sign-in session, sets the `auth` cookie, and returns HTTP 200 with the public user. The identifier is trimmed and lowercased; the password is compared unchanged. Invalid credentials return 401 with `invalid credentials`.

| Request field | Type and constraints                    | Usage                                  |
| ------------- | --------------------------------------- | -------------------------------------- |
| `identifier`  | required string, at most 300 characters | Provide the account username or email. |
| `password`    | required string, at most 300 characters | Provide the account password.          |

### `POST /auth/logout`

Ends the current sign-in session, clears the `auth` cookie, and returns HTTP 204 with no response body. It succeeds when no usable auth cookie is present.

### Public user shape

Registration, login, and the signed-in result from `/me` use this shape.

| Response field | Type   | Usage                             |
| -------------- | ------ | --------------------------------- |
| `username`     | string | Display the account username.     |
| `email`        | string | Display or use the account email. |

### `GET /me`

Returns HTTP 200 with `{ "user": ... }`. A missing, invalid, or expired sign-in session returns `user: null`, not 401. Unknown or expired tokens clear the `auth` cookie. Empty or malformed cookie values resolve as absent without clearing.

| Response field | Type                         | Usage                                                                  |
| -------------- | ---------------------------- | ---------------------------------------------------------------------- |
| `user`         | public user object or `null` | Treat `null` as signed out; otherwise use the public user shape above. |

## Visualization and assets

### `GET /visualization`

Returns a snapshot with a typed `scene` and a compatibility `items` array. Consumers should use `scene`; the compatibility fields remain in the response.

| Scene field                              | Type                                                  | Usage                                                  |
| ---------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| `products`                               | array of scene products                               | Render current catalog products.                       |
| `products[].productId`                   | string                                                | Identify the catalog product.                          |
| `products[].name`                        | string                                                | Label the product.                                     |
| `products[].category`                    | string                                                | Classify the product.                                  |
| `products[].price`                       | Money object                                          | Display the product price.                             |
| `products[].status`                      | `"ok"`, `"warn"`, `"error"`, or `"idle"`              | Represent product state; current products use `ok`.    |
| `products[].asset`                       | optional object with `url` and `format` strings       | Load the configured model when present.                |
| `products[].assetConfig`                 | optional map of numeric values                        | Configure the product asset when present.              |
| `recentOrders`                           | array of at most 10 scene orders, newest update first | Render individually surfaced recent orders.            |
| `recentOrders[].orderId`                 | string                                                | Identify the order.                                    |
| `recentOrders[].customerName`            | string or `null`                                      | Display the customer name when present.                |
| `recentOrders[].temperature`             | `"hot"` or `"cold"`                                   | Read current order temperature.                        |
| `recentOrders[].vizStatus`               | `"ok"` for hot orders, `"idle"` for cold orders       | Map the order to a visualization state.                |
| `recentOrders[].total`                   | Money object                                          | Display order total.                                   |
| `recentOrders[].lineCount`               | number                                                | Show the number of order lines.                        |
| `recentOrders[].placedAt`                | ISO date-time string                                  | Show placement time.                                   |
| `recentOrders[].updatedAt`               | ISO date-time string                                  | Determine recency.                                     |
| `orderAggregates.totalCount`             | number                                                | Count all orders.                                      |
| `orderAggregates.olderCount`             | number                                                | Count orders outside the 10-item recent window.        |
| `orderAggregates.temperatureCounts.hot`  | number                                                | Count all hot orders.                                  |
| `orderAggregates.temperatureCounts.cold` | number                                                | Count all cold orders.                                 |
| `cart`                                   | currently always `null`                               | No request-specific cart is included in this snapshot. |
| `latestActivityAt`                       | epoch milliseconds                                    | Compare the most recent order activity.                |

The compatibility `items` array contains every product and order, without the scene's recent-order limit. Failed catalog and order reads become empty collections independently. The route does not expose those failures as error responses.

| Compatibility item field | Type                                     | Usage                                               |
| ------------------------ | ---------------------------------------- | --------------------------------------------------- |
| `id`                     | string                                   | Identify the visualization item.                    |
| `label`                  | string                                   | Display its label.                                  |
| `type`                   | `"cube"`, `"sphere"`, or `"marker"`      | Select a compatibility representation.              |
| `value`                  | number                                   | Read the item's numeric value.                      |
| `status`                 | `"ok"`, `"warn"`, `"error"`, or `"idle"` | Represent item state.                               |
| `positionHint.x`         | number                                   | Read the suggested horizontal position.             |
| `positionHint.y`         | number                                   | Read the suggested vertical position.               |
| `positionHint.z`         | number                                   | Read the suggested depth position.                  |
| `metadata`               | map of string or number values           | Read the product or order metadata described below. |

Product metadata has `category`, `price` (minor units), `currency`, `source: "catalog"`, and `updatedAt: 0`. Optional `assetConfig` is a JSON string; optional model fields are `assetUrl` and `assetFormat`. Order metadata has `temperature`, `customerName` (or `"(no name)"`), `lineCount`, `total` (minor units), `currency`, `placedAt`, `source: "orders"`, and `updatedAt` in epoch milliseconds.

Every Money object has integer `amountMinor` and string `currency` fields. Use currency to interpret the amount.

### `GET /visualization/events`

Opens an unauthenticated Server-Sent Events stream with HTTP 200. Each event's `data` is a complete visualization snapshot with the same shape as `GET /visualization`. The stream emits immediately after connection, then after domain events settle for 50 milliseconds. Catalog creation, cart addition, order creation, and successful checkout emit events. Cart expiry and asset refresh do not emit events. Cooling alone does not emit an event, and no periodic heartbeat is defined. The application supplies no event ID, event type, retry interval, or replay store; reconnecting receives a fresh snapshot.

### `POST /assets/refresh`

Reloads asset configuration and model caches and returns HTTP 200 with `{ "ok": true }`. It takes no parameters or body. The route has no route-level authentication requirement.
