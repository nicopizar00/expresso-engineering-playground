"""Tiny HTTP helpers built on urllib + socket so the CLI stays stdlib-only.

Covers two needs:
  - JSON request/response with a configurable expected status.
  - Streaming SSE read that asserts at least one `data:` frame within a
    deadline. Used by the smoke command to verify
    GET /visualization-updates.
"""

from __future__ import annotations

import json
import socket
import urllib.error
import urllib.request
from typing import Optional, Tuple


class HttpError(RuntimeError):
    pass


def request_json(
    url: str,
    method: str = "GET",
    body: Optional[dict] = None,
    expect_status: Optional[int] = None,
    timeout: float = 5.0,
) -> Tuple[int, Optional[dict]]:
    data: Optional[bytes] = None
    headers = {"accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["content-type"] = "application/json"

    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status = resp.status
            raw = resp.read()
    except urllib.error.HTTPError as err:
        # Server responded — still meaningful for status assertions.
        status = err.code
        raw = err.read() if err.fp is not None else b""
    except (urllib.error.URLError, socket.timeout) as err:
        raise HttpError(str(err)) from err

    if expect_status is not None and status != expect_status:
        raise HttpError(f"Expected HTTP {expect_status}, got {status}")

    if not raw:
        return status, None
    try:
        return status, json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return status, None


def read_sse_data_frame(url: str, max_seconds: float = 3.0) -> bool:
    """Open url with a low-level HTTP client, request text/event-stream, and
    return True as soon as we see a line starting with `data:`.

    Uses http.client directly because urllib.request wraps the response in a
    buffered reader that prefers full-chunk fills over partial reads. SSE is
    line-oriented and bursty, so a line-by-line readline against a socket
    with a wall-clock deadline is the right shape.
    """
    import http.client
    import urllib.parse

    parsed = urllib.parse.urlparse(url)
    host = parsed.hostname or "localhost"
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"

    deadline = _Monotonic.now() + max_seconds
    conn_cls = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
    conn = conn_cls(host, port, timeout=max_seconds)
    try:
        conn.request(
            "GET",
            path,
            headers={"Accept": "text/event-stream", "Cache-Control": "no-cache"},
        )
        resp = conn.getresponse()
        if resp.status != 200:
            return False
        ctype = resp.getheader("content-type", "")
        if "text/event-stream" not in ctype:
            return False
        while True:
            remaining = deadline - _Monotonic.now()
            if remaining <= 0:
                return False
            # Per-read deadline — readline blocks on the socket, which honours
            # the timeout we set on the connection.
            try:
                resp.fp.flush()  # type: ignore[union-attr]
            except Exception:  # noqa: BLE001
                pass
            try:
                line = resp.readline(4096)
            except (socket.timeout, OSError):
                return False
            if not line:
                return False
            if line.startswith(b"data:"):
                return True
    finally:
        try:
            conn.close()
        except Exception:  # noqa: BLE001
            pass


class _Monotonic:
    """Indirection so tests can patch the clock."""

    @staticmethod
    def now() -> float:
        import time
        return time.monotonic()
