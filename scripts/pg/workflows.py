"""Repository-owned k6 workflow IDs and the port each one targets by default.

Stdlib-only on purpose: cli.py builds `./dev perf:<id>` from this table at
import time, and `./dev --help` must work before Punch's requirements are
installed. IDs are the YAML stems in tests/performance/k6/workflows/
(test_k6runner pins the two together). browser-* workflows drive the web
app's UI; every other workflow calls the BFF.
"""

from __future__ import annotations

from typing import Dict

from pg.paths import BFF_PORT, WEB_PORT

WORKFLOWS: Dict[str, int] = {
    "browser-cart": WEB_PORT,
    "browser-purchase": WEB_PORT,
    "http-auth-login": BFF_PORT,
    "http-cart": BFF_PORT,
    "http-me-hot-status": BFF_PORT,
    "http-orders": BFF_PORT,
    "http-orders-status": BFF_PORT,
    "http-purchase": BFF_PORT,
    "http-purchase-registered": BFF_PORT,
}
