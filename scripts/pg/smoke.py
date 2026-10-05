"""smoke — hit every active endpoint and verify status codes + SSE frame.
Mirrors playground.mjs:331 and ./dev:279. The endpoint list, expected
statuses, and SSE frame assertion are byte-equivalent.
"""

from __future__ import annotations

import http.cookiejar
import secrets
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
    placed: dict = {}

    def checkout() -> None:
        _, payload = request_json(
            f"{API_BASE}/checkout", method="POST", body={"cartId": cart_id},
            expect_status=201, cookie_jar=jar,
        )
        if not isinstance(payload, dict) or "status" in payload:
            raise HttpError("checkout receipt must be an object without status")
        placed["orderId"] = payload.get("orderId")
    results.append(_check("POST /checkout", checkout))
    results.append(_check("GET  /orders/ord_demo",
                          _expect("GET", "/orders/ord_demo", 200, cookie_jar=jar)))

    def order_status() -> None:
        _, payload = request_json(f"{API_BASE}/orders/ord_demo/status", expect_status=200, cookie_jar=jar)
        if not isinstance(payload, dict):
            raise HttpError("Expected an object payload")
        for key in ("orderId", "temperature", "placedAt", "coolsAt", "checkedAt"):
            if key not in payload:
                raise HttpError(f"order status missing key: {key}")
        if "status" in payload:
            raise HttpError("order status payload must not carry status")
        if payload["temperature"] not in ("hot", "cold"):
            raise HttpError(f"unexpected temperature: {payload['temperature']!r}")
    results.append(_check("GET  /orders/ord_demo/status (typed temperature)", order_status))

    def my_orders() -> None:
        _, payload = request_json(f"{API_BASE}/orders/mine", expect_status=200, cookie_jar=jar)
        items = payload.get("items") if isinstance(payload, dict) else None
        if not isinstance(items, list):
            raise HttpError("Expected items array")
        ids = [o.get("orderId") for o in items if isinstance(o, dict)]
        if placed.get("orderId") not in ids:
            raise HttpError(f"placed order {placed.get('orderId')!r} missing from /orders/mine")
        if "ord_demo" in ids:
            raise HttpError("seed order ord_demo must not belong to a session")
        if any(isinstance(o, dict) and "sessionId" in o for o in items):
            raise HttpError("/orders/mine must not expose sessionId")
    results.append(_check("GET  /orders/mine (session-owned)", my_orders))

    # Login feature: a fresh user (own cookie jar) registers, orders for
    # themselves, and sees that order as the hot latest in /account/orders.
    acct_jar = http.cookiejar.CookieJar()
    suffix = secrets.token_hex(4)
    acct = {"username": f"smoke_{suffix}", "email": f"smoke_{suffix}@example.test"}
    acct_placed: dict = {}

    def register() -> None:
        _, payload = request_json(
            f"{API_BASE}/auth/register", method="POST",
            body={**acct, "password": "smoke-password"},
            expect_status=201, cookie_jar=acct_jar,
        )
        if payload != acct:
            raise HttpError(f"unexpected register payload: {payload!r}")
    results.append(_check("POST /auth/register", register))

    def me() -> None:
        _, payload = request_json(f"{API_BASE}/auth/me", expect_status=200, cookie_jar=acct_jar)
        if not isinstance(payload, dict) or payload.get("user") != acct:
            raise HttpError(f"/auth/me did not return the new user: {payload!r}")
    results.append(_check("GET  /auth/me", me))

    def checkout_self() -> None:
        request_json(
            f"{API_BASE}/cart/items", method="POST",
            body={"productId": "prod_espresso", "quantity": 1},
            expect_status=201, cookie_jar=acct_jar,
        )
        _, payload = request_json(
            f"{API_BASE}/checkout", method="POST",
            body={"cartId": _resolve_cart_id(acct_jar), "orderFor": {"type": "self"}},
            expect_status=201, cookie_jar=acct_jar,
        )
        acct_placed["orderId"] = payload.get("orderId") if isinstance(payload, dict) else None
    results.append(_check("POST /checkout (orderFor self)", checkout_self))

    def account_orders() -> None:
        _, payload = request_json(f"{API_BASE}/account/orders", expect_status=200, cookie_jar=acct_jar)
        latest = payload.get("latest") if isinstance(payload, dict) else None
        if not isinstance(latest, dict) or latest.get("orderId") != acct_placed.get("orderId"):
            raise HttpError(f"latest is not the order just placed: {latest!r}")
        if latest.get("temperature") != "hot":
            raise HttpError(f"latest order should be hot, got {latest.get('temperature')!r}")
        if latest.get("owner") != {"username": acct["username"]}:
            raise HttpError(f"unexpected owner: {latest.get('owner')!r}")
    results.append(_check("GET  /account/orders (latest hot)", account_orders))

    def hot_status() -> None:
        _, payload = request_json(f"{API_BASE}/account/hot-status", expect_status=200, cookie_jar=acct_jar)
        if not isinstance(payload, dict):
            raise HttpError(f"unexpected hot-status payload: {payload!r}")
        if not isinstance(payload.get("hotCount"), int) or payload["hotCount"] < 1:
            raise HttpError(f"hotCount should be >= 1, got {payload.get('hotCount')!r}")
        next_cools = payload.get("nextCoolsAt")
        server_time = payload.get("serverTime")
        if not isinstance(next_cools, str) or not isinstance(server_time, str):
            raise HttpError(f"nextCoolsAt/serverTime must be strings: {payload!r}")
        # ISO-8601 strings in the same UTC format compare chronologically.
        if not next_cools > server_time:
            raise HttpError(f"nextCoolsAt {next_cools!r} is not after serverTime {server_time!r}")
    results.append(_check("GET  /account/hot-status (hot count)", hot_status))

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
        if not isinstance(aggregates, dict) or "totalCount" not in aggregates or "temperatureCounts" not in aggregates:
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
