// Resolves the BFF base URL so the same scene works in both access modes:
//   • Direct  (http://localhost:3002) : window.__VIZ_CONFIG__ shim or port fallback
//   • Proxied (/viz/*)               : same-origin /api/bff rewrite
const API_BASE = (() => {
  if (typeof window === "undefined") return "http://localhost:3001";
  if (window.location.pathname.startsWith("/viz")) return "/api/bff";
  return window.__VIZ_CONFIG__?.apiBaseUrl || "http://localhost:3001";
})();

const POLL_INTERVAL_MS = 2000;
const SSE_RETRY_MS     = 5000;

// =============================================================================
// initTransport — SSE primary, polling fallback.
//
// Status strings written to statusEl (contract documented in index.html):
//   • "live (sse) · N object/s"     — SSE typed snapshot rendered
//   • "live · N object/s"           — polling tick rendered
//   • "polling…"                    — poll tick in flight
//   • "error · <message>"           — failed tick when scene already populated
//   • "offline · N mock object/s"   — first-load fetch failed → fallbackScene
//
// State is encapsulated in this factory closure; nothing leaks to module scope.
// =============================================================================
export function initTransport({
  onScene,
  sceneObjectCount,
  statusEl,
  dataGroup,
  fallbackScene,
}) {
  let inflight       = false;
  let pollHandle     = null;
  let sseSource      = null;
  let sseRetryHandle = null;

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  async function fetchPayload() {
    const res  = await fetch(`${API_BASE}/visualization-data`, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (!body || typeof body !== "object" || typeof body.scene !== "object" || body.scene === null) {
      throw new Error("malformed response");
    }
    return body;
  }

  async function loadAndRender() {
    if (inflight) return;
    inflight = true;
    setStatus("polling…");
    try {
      let payload = null;
      try {
        payload = await fetchPayload();
      } catch (err) {
        if (dataGroup.children.length > 0) { setStatus(`error · ${err.message}`); return; }
      }
      if (payload && typeof payload.scene === "object" && payload.scene !== null) {
        onScene(payload.scene);
        const count = sceneObjectCount(payload.scene);
        setStatus(`live · ${count} object${count === 1 ? "" : "s"}`);
        return;
      }
      // Offline: render the typed fallback scene so the showcase exercises the
      // same dispatcher as a live BFF.
      onScene(fallbackScene);
      const count = sceneObjectCount(fallbackScene);
      setStatus(`offline · ${count} mock object${count === 1 ? "" : "s"}`);
    } finally {
      inflight = false;
    }
  }

  function startPolling() {
    stopPolling();
    void loadAndRender();
    pollHandle = setInterval(() => void loadAndRender(), POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollHandle !== null) { clearInterval(pollHandle); pollHandle = null; }
  }

  function connect() {
    if (typeof EventSource === "undefined") { startPolling(); return; }

    if (sseSource) { sseSource.close(); sseSource = null; }
    clearTimeout(sseRetryHandle);
    sseRetryHandle = null;

    sseSource = new EventSource(`${API_BASE}/visualization-updates`);

    sseSource.addEventListener("open", () => {
      stopPolling();
      clearTimeout(sseRetryHandle);
      sseRetryHandle = null;
    });

    sseSource.addEventListener("message", (event) => {
      try {
        const body = JSON.parse(event.data);
        if (!body || typeof body.scene !== "object" || body.scene === null) {
          throw new Error("malformed");
        }
        onScene(body.scene);
        const count = sceneObjectCount(body.scene);
        setStatus(`live (sse) · ${count} object${count === 1 ? "" : "s"}`);
      } catch {
        void loadAndRender();
      }
    });

    sseSource.addEventListener("error", () => {
      if (sseSource) { sseSource.close(); sseSource = null; }
      startPolling();
      sseRetryHandle = setTimeout(() => connect(), SSE_RETRY_MS);
    });
  }

  function pauseForHidden() {
    stopPolling();
    if (sseSource) { sseSource.close(); sseSource = null; }
    clearTimeout(sseRetryHandle);
    sseRetryHandle = null;
  }

  return { connect, pauseForHidden };
}
