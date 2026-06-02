"""smoke — hit every active endpoint and verify status codes + SSE frame.
Mirrors playground.mjs:331 and ./dev:279. The endpoint list, expected
statuses, and SSE frame assertion are byte-equivalent.
"""

from __future__ import annotations

from typing import Callable, List, Tuple

from pg.ansi import bold, dim, fail, green, header, pass_, red
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


def _expect(method: str, path: str, status: int, body: dict | None = None) -> Callable[[], None]:
    def go() -> None:
        request_json(f"{API_BASE}{path}", method=method, body=body, expect_status=status)
    return go


def _resolve_cart_item_id() -> str:
    try:
        _, payload = request_json(f"{API_BASE}/cart", expect_status=200)
        if isinstance(payload, dict):
            items = payload.get("items") or []
            if items and isinstance(items[0], dict):
                value = items[0].get("itemId")
                if isinstance(value, str) and value:
                    return value
    except HttpError:
        pass
    return "ci_001"


def run() -> int:
    header("Playground Smoke Test")
    print(dim(f"Target: {API_BASE}"))
    print()

    results: List[bool] = []

    results.append(_check("GET  /health", _expect("GET", "/health", 200)))
    results.append(_check("GET  /catalog/products",
                          _expect("GET", "/catalog/products", 200)))
    results.append(_check("GET  /catalog/products/prod_espresso",
                          _expect("GET", "/catalog/products/prod_espresso", 200)))
    results.append(_check("POST /cart/items",
                          _expect("POST", "/cart/items", 201,
                                  body={"productId": "prod_espresso", "quantity": 2})))
    results.append(_check("POST /cart/items (2nd)",
                          _expect("POST", "/cart/items", 201,
                                  body={"productId": "prod_espresso", "quantity": 1})))
    results.append(_check("GET  /cart", _expect("GET", "/cart", 200)))

    item_id = _resolve_cart_item_id()
    results.append(_check(
        "PATCH /cart/items/:id",
        _expect("PATCH", f"/cart/items/{item_id}", 200, body={"quantity": 3}),
    ))
    results.append(_check(
        "DELETE /cart/items/:id",
        _expect("DELETE", f"/cart/items/{item_id}", 200),
    ))
    results.append(_check(
        "POST /checkout",
        _expect("POST", "/checkout", 201, body={"customerName": "Smoke Customer"}),
    ))
    results.append(_check("GET  /orders/ord_demo",
                          _expect("GET", "/orders/ord_demo", 200)))
    results.append(_check(
        "POST /orders/ord_demo/manage (mark_prepared)",
        _expect("POST", "/orders/ord_demo/manage", 202, body={"action": "mark_prepared"}),
    ))

    def viz_data() -> None:
        _, payload = request_json(f"{API_BASE}/visualization-data", expect_status=200)
        if not isinstance(payload, dict) or not isinstance(payload.get("items"), list) or not payload["items"]:
            raise HttpError("Expected non-empty items array")
    results.append(_check("GET  /visualization-data", viz_data))

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
