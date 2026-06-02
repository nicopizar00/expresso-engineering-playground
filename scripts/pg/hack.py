"""hack — debugging affordances over the live container stack.

Sub-commands:
  exec  <svc> [cmd...]    Open a shell or run a command inside a service.
  env   <svc>             Diff in-container env vs root .env.
  sql   [--query|--file]  One-shot psql against the postgres service.
  trace <method> <path>   Curl with a generated traceparent + pull spans
                          from Tempo and pretty-print the tree.

All four are read-mostly. None of them mutate the database without a query
the user explicitly provides.
"""

from __future__ import annotations

import json
import os
import re
import secrets
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from pg import compose
from pg.ansi import bold, dim, fail, green, header, info, pass_, red, warn, yellow
from pg.http import HttpError, request_json
from pg.paths import API_BASE, ENV_PATH, TEMPO_PORT


# ── exec ───────────────────────────────────────────────────────────────────


def _exec(args: Sequence[str]) -> int:
    if not args:
        fail("Usage: ./dev hack exec <service> [-- cmd args...]")
        return 1

    shell_override: Optional[str] = None
    positional: List[str] = []
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--shell":
            if i + 1 >= len(args):
                fail("--shell requires a value (sh|bash)")
                return 1
            shell_override = args[i + 1]
            i += 2
            continue
        if a == "--":
            # Idiomatic separator between hack flags and the inner command.
            positional.extend(args[i + 1 :])
            break
        positional.append(a)
        i += 1

    if not positional:
        fail("Usage: ./dev hack exec <service> [-- cmd args...]")
        return 1
    svc, *rest = positional

    if rest:
        cmd = compose.base_cmd() + ["exec", svc, *rest]
        return subprocess.run(cmd, check=False).returncode

    # Interactive shell. Probe for bash unless overridden.
    if shell_override:
        shell = shell_override
    else:
        probe = compose.capture(["exec", "-T", svc, "sh", "-c", "command -v bash || true"])
        shell = "bash" if (probe.returncode == 0 and probe.stdout.strip()) else "sh"

    info(f"Entering {shell} in {bold(svc)} (Ctrl+D to exit)")
    cmd = compose.base_cmd() + ["exec", svc, shell]
    return subprocess.run(cmd, check=False).returncode


# ── env ────────────────────────────────────────────────────────────────────


_DOTENV_LINE = re.compile(r"^([A-Z0-9_]+)=(.*)$")


def _read_dotenv(path: Path) -> Dict[str, str]:
    out: Dict[str, str] = {}
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        m = _DOTENV_LINE.match(line)
        if m:
            out[m.group(1)] = m.group(2)
    return out


def _container_env(svc: str) -> Optional[Dict[str, str]]:
    probe = compose.capture(["exec", "-T", svc, "printenv"])
    if probe.returncode != 0:
        return None
    parsed: Dict[str, str] = {}
    for line in probe.stdout.splitlines():
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        parsed[key] = value
    return parsed


def _truncate(text: str, width: int) -> str:
    if len(text) <= width:
        return text.ljust(width)
    return text[: width - 1] + "…"


def _env(args: Sequence[str]) -> int:
    if not args:
        fail("Usage: ./dev hack env <service>")
        return 1
    svc = args[0]

    header(f"Env diff: {svc}")
    container = _container_env(svc)
    if container is None:
        fail(f"Could not exec into '{svc}' — is it running? ./dev status")
        return 1
    host = _read_dotenv(ENV_PATH)

    keys = sorted(set(host.keys()) | set(container.keys()))
    # Filter out noisy PATH-style and shell internals the user almost never
    # cares about — they're rarely interesting and clutter the table.
    skip_prefixes = (
        "PATH", "PWD", "SHLVL", "HOME", "HOSTNAME", "TERM", "LANG", "LC_",
        "NODE_VERSION", "PNPM_HOME", "YARN_VERSION", "OLDPWD", "_",
    )
    keys = [k for k in keys if not k.startswith(skip_prefixes)]

    name_w, container_w, host_w = 32, 40, 40
    print(f"  {bold(_truncate('KEY', name_w))}  {bold(_truncate('CONTAINER', container_w))}  {bold(_truncate('.env', host_w))}")
    diffs = 0
    only_in_container = 0
    only_in_host = 0
    for key in keys:
        c_val = container.get(key)
        h_val = host.get(key)
        c_disp = c_val if c_val is not None else "—"
        h_disp = h_val if h_val is not None else "—"
        if c_val is None:
            line = f"  {_truncate(key, name_w)}  {red(_truncate(c_disp, container_w))}  {_truncate(h_disp, host_w)}"
            only_in_host += 1
        elif h_val is None:
            line = f"  {_truncate(key, name_w)}  {_truncate(c_disp, container_w)}  {dim(_truncate(h_disp, host_w))}"
            only_in_container += 1
        elif c_val != h_val:
            line = f"  {_truncate(key, name_w)}  {yellow(_truncate(c_disp, container_w))}  {yellow(_truncate(h_disp, host_w))}"
            diffs += 1
        else:
            line = f"  {dim(_truncate(key, name_w))}  {dim(_truncate(c_disp, container_w))}  {dim(_truncate(h_disp, host_w))}"
        print(line)
    print()
    summary = (
        f"  {diffs} differ · {only_in_container} container-only · {only_in_host} .env-only"
    )
    print(summary)
    print()
    print(dim("Container-only is normal (compose sets PORT, DATABASE_URL, etc.)."))
    print(dim("Differences may be intentional — compose overrides are common."))
    print()
    return 0


# ── sql ────────────────────────────────────────────────────────────────────


def _postgres_url() -> str:
    user = os.environ.get("POSTGRES_USER", "playground")
    pwd = os.environ.get("POSTGRES_PASSWORD", "playground")
    db = os.environ.get("POSTGRES_DB", "mini_commerce_playground")
    return f"postgres://{user}:{pwd}@localhost:5432/{db}"


def _sql(args: Sequence[str]) -> int:
    query: Optional[str] = None
    file_path: Optional[Path] = None
    as_json = False

    i = 0
    while i < len(args):
        a = args[i]
        if a in ("--query", "-q"):
            if i + 1 >= len(args):
                fail(f"{a} requires a value")
                return 1
            query = args[i + 1]
            i += 2
        elif a in ("--file", "-f"):
            if i + 1 >= len(args):
                fail(f"{a} requires a value")
                return 1
            file_path = Path(args[i + 1])
            i += 2
        elif a == "--json":
            as_json = True
            i += 1
        else:
            fail(f"Unknown arg: {a}")
            return 1

    if query and file_path:
        fail("--query and --file are mutually exclusive")
        return 1

    psql_args = ["psql", _postgres_url()]
    if as_json:
        # Emit a top-level JSON array via psql trickery.
        if not query:
            fail("--json requires --query")
            return 1
        wrapped = f"SELECT json_agg(row_to_json(t)) FROM ({query.rstrip(';')}) t;"
        psql_args.extend(["-At", "-c", wrapped])
        cmd = compose.base_cmd() + ["exec", "-T", "postgres", *psql_args]
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            fail(result.stderr.strip() or "psql failed")
            return result.returncode
        body = result.stdout.strip()
        if body == "":
            print("[]")
        else:
            try:
                parsed = json.loads(body)
                print(json.dumps(parsed, indent=2))
            except json.JSONDecodeError:
                print(body)
        return 0

    if query:
        psql_args.extend(["-c", query])
        cmd = compose.base_cmd() + ["exec", "-T", "postgres", *psql_args]
        return subprocess.run(cmd, check=False).returncode

    if file_path:
        if not file_path.exists():
            fail(f"SQL file not found: {file_path}")
            return 1
        cmd = compose.base_cmd() + ["exec", "-T", "postgres", *psql_args]
        with file_path.open("rb") as handle:
            return subprocess.run(cmd, stdin=handle, check=False).returncode

    # Interactive psql.
    cmd = compose.base_cmd() + ["exec", "postgres", *psql_args]
    return subprocess.run(cmd, check=False).returncode


# ── trace ──────────────────────────────────────────────────────────────────


def _generate_traceparent() -> Tuple[str, str]:
    trace_id = secrets.token_hex(16)
    span_id = secrets.token_hex(8)
    return trace_id, f"00-{trace_id}-{span_id}-01"


def _tempo_ready() -> bool:
    try:
        with urllib.request.urlopen(
            f"http://localhost:{TEMPO_PORT}/ready", timeout=2.0
        ) as resp:
            return resp.status == 200
    except (urllib.error.URLError, socket.timeout):
        return False


def _fetch_trace(trace_id: str, deadline_seconds: float = 10.0) -> Optional[dict]:
    """Poll Tempo until the trace is available or we exceed the deadline."""
    end = time.monotonic() + deadline_seconds
    last_err: Optional[str] = None
    while time.monotonic() < end:
        try:
            with urllib.request.urlopen(
                f"http://localhost:{TEMPO_PORT}/api/traces/{trace_id}",
                timeout=2.0,
            ) as resp:
                if resp.status == 200:
                    return json.loads(resp.read().decode("utf-8"))
                last_err = f"HTTP {resp.status}"
        except urllib.error.HTTPError as err:
            last_err = f"HTTP {err.code}"
        except (urllib.error.URLError, socket.timeout) as err:
            last_err = str(err)
        time.sleep(0.5)
    if last_err:
        info(f"Last Tempo response: {last_err}")
    return None


def _render_spans(trace: dict) -> None:
    """Tempo's response is OTLP-shaped: { batches: [ { resource, scopeSpans:
    [ { spans: [...] } ] } ] }. Flatten and print as a tree by parentSpanId."""
    nodes: List[dict] = []
    for batch in trace.get("batches", []):
        resource_attrs = {
            attr.get("key"): _flatten_attr_value(attr.get("value", {}))
            for attr in batch.get("resource", {}).get("attributes", [])
        }
        service = resource_attrs.get("service.name", "unknown")
        for scope in batch.get("scopeSpans", []):
            for span in scope.get("spans", []):
                start_ns = int(span.get("startTimeUnixNano", 0))
                end_ns = int(span.get("endTimeUnixNano", 0))
                duration_ms = (end_ns - start_ns) / 1_000_000 if end_ns > start_ns else 0
                nodes.append(
                    {
                        "spanId": span.get("spanId"),
                        "parentSpanId": span.get("parentSpanId"),
                        "name": span.get("name"),
                        "service": service,
                        "duration_ms": duration_ms,
                        "start_ns": start_ns,
                    }
                )
    if not nodes:
        warn("No spans in the trace payload.")
        return

    by_parent: Dict[str, List[dict]] = {}
    for node in nodes:
        parent = node.get("parentSpanId") or ""
        by_parent.setdefault(parent, []).append(node)
    for children in by_parent.values():
        children.sort(key=lambda n: n.get("start_ns") or 0)

    roots = by_parent.get("", []) or sorted(nodes, key=lambda n: n["start_ns"])[:1]

    def render(node: dict, depth: int) -> None:
        prefix = "  " * depth
        marker = "└─" if depth else "•"
        duration = f"{node['duration_ms']:.1f} ms"
        line = f"{prefix}{marker} {bold(node['service'])} :: {node['name']} {dim(f'({duration})')}"
        print(line)
        for child in by_parent.get(node.get("spanId") or "", []):
            render(child, depth + 1)

    print()
    print(bold("Span tree:"))
    for root in roots:
        render(root, 0)
    print()


def _flatten_attr_value(value: dict) -> str:
    for key in ("stringValue", "intValue", "doubleValue", "boolValue"):
        if key in value:
            return str(value[key])
    if "arrayValue" in value:
        items = value["arrayValue"].get("values", [])
        return ", ".join(_flatten_attr_value(v) for v in items)
    return ""


def _trace(args: Sequence[str]) -> int:
    if len(args) < 2:
        fail("Usage: ./dev hack trace <METHOD> <path> [--body <json>]")
        return 1
    method = args[0].upper()
    path = args[1]
    body_raw: Optional[str] = None
    i = 2
    while i < len(args):
        if args[i] == "--body":
            if i + 1 >= len(args):
                fail("--body requires JSON")
                return 1
            body_raw = args[i + 1]
            i += 2
        else:
            fail(f"Unknown arg: {args[i]}")
            return 1

    if not _tempo_ready():
        fail("Tempo is not reachable on :3200. Run: ./dev up obs")
        return 1

    trace_id, traceparent = _generate_traceparent()
    info(f"trace-id: {trace_id}")
    info(f"traceparent: {traceparent}")

    headers: List[Tuple[str, str]] = [("traceparent", traceparent)]
    data: Optional[bytes] = None
    if body_raw:
        try:
            payload = json.loads(body_raw)
        except json.JSONDecodeError as err:
            fail(f"--body is not valid JSON: {err}")
            return 1
        data = json.dumps(payload).encode("utf-8")
        headers.append(("content-type", "application/json"))

    url = f"{API_BASE}{path}"
    req = urllib.request.Request(url, data=data, method=method)
    for k, v in headers:
        req.add_header(k, v)
    info(f"{method} {url}")
    try:
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            status = resp.status
            ctype = resp.headers.get("content-type", "")
    except urllib.error.HTTPError as err:
        status = err.code
        ctype = err.headers.get("content-type", "") if err.headers else ""
    except (urllib.error.URLError, socket.timeout) as err:
        fail(f"Request failed: {err}")
        return 1

    pass_(f"HTTP {status} ({ctype.split(';')[0] or 'unknown'})")
    info("Polling Tempo for span tree (up to 10 s)...")

    trace = _fetch_trace(trace_id, deadline_seconds=10.0)
    if not trace:
        fail("Tempo never returned the trace within 10 s.")
        info("Spans may take a few seconds to ingest — retry the command, "
             "or open Grafana → Explore → Tempo → trace ID search.")
        return 1
    _render_spans(trace)
    return 0


# ── dispatch ───────────────────────────────────────────────────────────────


_SUBCOMMANDS = {
    "exec": _exec,
    "env": _env,
    "sql": _sql,
    "trace": _trace,
}


def _usage() -> None:
    print()
    print(bold("./dev hack — debugging affordances"))
    print()
    print("Subcommands:")
    print(f"  ./dev hack {bold('exec')}  <svc> [-- cmd args...]   Shell into a service container")
    print(f"  ./dev hack {bold('env')}   <svc>                     Diff container env vs .env")
    print(f"  ./dev hack {bold('sql')}   [--query Q | --file F | --json]   Run psql against postgres")
    print(f"  ./dev hack {bold('trace')} <METHOD> <path> [--body J]        Curl with traceparent + pull spans from Tempo")
    print()


def dispatch(args: Sequence[str]) -> int:
    if not args or args[0] in ("-h", "--help", "help"):
        _usage()
        return 0
    sub = _SUBCOMMANDS.get(args[0])
    if not sub:
        fail(f"Unknown hack subcommand: {args[0]}")
        _usage()
        return 1
    return sub(args[1:])
