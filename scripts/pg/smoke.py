"""smoke — hit every active endpoint and verify status codes + SSE frame.
Mirrors playground.mjs:331 and ./dev:279. The endpoint list, expected
statuses, and SSE frame assertion are byte-equivalent.
"""

from __future__ import annotations

import http.cookiejar
from typing import Callable, List, Optional

from pg.ansi import dim, fail, green, header, pass_, red
from pg.http import HttpError, read_sse_data_frame, request_json
from pg.paths import API_BASE


def _check(label: str, fn: Callable[[], None]) -> bool:
    try:
        fn()
        pass_(label)
        return True
    except HttpError as err:
        fail(f"{label}  — {err}")
        return False
    except Exception as err:  # noqa: BLE001
        fail(f"{label}  — {err}")
        return False


def _expect(
    method: str,
    path: str,
    status: int,
    body: dict | None = None,
    cookie_jar: Optional[http.cookiejar.CookieJar] = None,
) -> Callable[[], None]:
    def go() -> None:
        request_json(
            f"{API_BASE}{path}",
            method=method,
            body=body,
            expect_status=status,
            cookie_jar=cookie_jar,
        )
    return go


def _resolve_cart_item_id(cookie_jar: http.cookiejar.CookieJar) -> str:
    try:
        _, payload = request_json(
            f"{API_BASE}/cart", expect_status=200, cookie_jar=cookie_jar,
        )
        if isinstance(payload, dict):
            items = payload.get("items") or []
            if items and isinstance(items[0], dict):
                value = items[0].get("itemId")
                if isinstance(value, str) and value:
                    return value
    except HttpError:
        pass
    return "ci_001"


def _resolve_cart_id(cookie_jar: http.cookiejar.CookieJar) -> Optional[str]:
    try:
        _, payload = request_json(
            f"{API_BASE}/cart", expect_status=200, cookie_jar=cookie_jar,
        )
        if isinstance(payload, dict):
            value = payload.get("cartId")
            if isinstance(value, str) and value:
                return value
    except HttpError:
        pass
    return None


def run() -> int:
    header("Playground Smoke Test")
    print(dim(f"Target: {API_BASE}"))
    print()

    results: List[bool] = []
    # One shared cookie jar for the whole run — cart/session evolution
    # made the cart per-session, so every check in this sequence must
    # reuse the same session (the same simulated "one browser") for the
    # add → mutate-rejected → checkout flow to mean anything.
    jar = http.cookiejar.CookieJar()

    results.append(_check("GET  /health", _expect("GET", "/health", 200, cookie_jar=jar)))
    results.append(_check("GET  /catalog/products",
                          _expect("GET", "/catalog/products", 200, cookie_jar=jar)))
    results.append(_check("GET  /catalog/products/prod_espresso",
                          _expect("GET", "/catalog/products/prod_espresso", 200, cookie_jar=jar)))
    results.append(_check("POST /cart/items",
                          _expect("POST", "/cart/items", 201,
                                  body={"productId": "prod_espresso", "quantity": 1},
                                  cookie_jar=jar)))
    results.append(_check("POST /cart/items (2nd, rejected — cart occupied)",
                          _expect("POST", "/cart/items", 409,
                                  body={"productId": "prod_espresso", "quantity": 1},
                                  cookie_jar=jar)))
    results.append(_check("GET  /cart", _expect("GET", "/cart", 200, cookie_jar=jar)))

    item_id = _resolve_cart_item_id(jar)
    results.append(_check(
        "PATCH /cart/items/:id (rejected — quantity change not allowed)",
        _expect("PATCH", f"/cart/items/{item_id}", 409, body={"quantity": 3}, cookie_jar=jar),
    ))
    results.append(_check(
        "DELETE /cart/items/:id (rejected — removal not allowed once selected)",
        _expect("DELETE", f"/cart/items/{item_id}", 409, cookie_jar=jar),
    ))
    results.append(_check(
        "POST /checkout (rejected — customerName not accepted)",
        _expect("POST", "/checkout", 400, body={"customerName": "Smoke Customer"}, cookie_jar=jar),
    ))
    cart_id = _resolve_cart_id(jar)
    results.append(_check(
        "POST /checkout",
        _expect("POST", "/checkout", 201, body={"cartId": cart_id}, cookie_jar=jar),
    ))
    results.append(_check("GET  /orders/ord_demo",
                          _expect("GET", "/orders/ord_demo", 200, cookie_jar=jar)))
    results.append(_check(
        "POST /orders/ord_demo/manage (mark_prepared)",
        _expect("POST", "/orders/ord_demo/manage", 202, body={"action": "mark_prepared"}, cookie_jar=jar),
    ))

    def viz_data() -> None:
        _, payload = request_json(f"{API_BASE}/visualization-data", expect_status=200, cookie_jar=jar)
        if not isinstance(payload, dict) or not isinstance(payload.get("items"), list) or not payload["items"]:
            raise HttpError("Expected non-empty items array")
    results.append(_check("GET  /visualization-data", viz_data))

    def viz_scene() -> None:
        _, payload = request_json(f"{API_BASE}/visualization-data", expect_status=200, cookie_jar=jar)
        if not isinstance(payload, dict):
            raise HttpError("Expected an object payload")
        scene = payload.get("scene")
        if not isinstance(scene, dict):
            raise HttpError("Expected scene to be an object (EOC-2)")
        for key in ("products", "recentOrders", "orderAggregates", "latestActivityAt"):
            if key not in scene:
                raise HttpError(f"scene missing key: {key}")
        if not isinstance(scene["products"], list):
            raise HttpError("scene.products must be a list")
        if not isinstance(scene["recentOrders"], list):
            raise HttpError("scene.recentOrders must be a list")
        aggregates = scene["orderAggregates"]
        if not isinstance(aggregates, dict) or "totalCount" not in aggregates or "statusCounts" not in aggregates:
            raise HttpError("scene.orderAggregates malformed")
        # cart key is allowed to be null when itemCount=0
        if "cart" not in scene:
            raise HttpError("scene missing key: cart")
    results.append(_check("GET  /visualization-data (scene shape)", viz_scene))

    def sse() -> None:
        ok = read_sse_data_frame(f"{API_BASE}/visualization-updates", max_seconds=3.0)
        if not ok:
            raise HttpError("No SSE data frame received")
    results.append(_check("GET  /visualization-updates (SSE)", sse))

    print()
    passed = sum(1 for ok in results if ok)
    total = len(results)
    if passed == total:
        print(green(f"All {total} smoke checks passed."))
        print()
        return 0
    print(red(f"{passed}/{total} smoke checks passed."))
    print()
    print(dim("Ensure the BFF is running: ./dev up"))
    print()
    return 1
