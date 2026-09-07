// apps/visualizer-3d/public/traffic-transport.js
//
// Workflow-traffic feed — independent EventSource from transport.js's
// domain-state stream (never imports from or modifies transport.js).
// Event-based, not snapshot-based: each SSE message is one workflow-traffic
// event, never a recomputed full state. Owns its own HUD bookkeeping, the
// same way initTransport owns setStatus internally.
import { trafficVisualFor } from "./objects/traffic-cup.js";

const API_BASE = (() => {
  if (typeof window === "undefined") return "http://localhost:3001";
  if (window.location.pathname.startsWith("/viz")) return "/api/bff";
  return window.__VIZ_CONFIG__?.apiBaseUrl || "http://localhost:3001";
})();

const SSE_RETRY_MS = 5000;

// Built with createElement/textContent, never innerHTML: useCaseId reaches the
// HUD from an unauthenticated, unvalidated ingest POST, so string-interpolated
// markup here would be a stored-injection sink.
function renderLegend(container, useCases) {
  container.textContent = "";
  for (const { label, colorHex } of useCases.values()) {
    const item = document.createElement("span");
    item.className = "traffic-legend-item";
    const swatch = document.createElement("span");
    swatch.className = "traffic-swatch";
    swatch.style.background = colorHex;
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(label));
    container.appendChild(item);
  }
}

export function initTrafficTransport({ onEvent, hudEls }) {
  let sseSource = null;
  let sseRetryHandle = null;
  const hudState = { runId: null, useCases: new Map(), succeeded: 0, failed: 0 };

  function updateHud(evt) {
    if (!hudEls?.root) return;
    if (evt.runId !== hudState.runId) {
      hudState.runId = evt.runId;
      hudState.useCases.clear();
      hudState.succeeded = 0;
      hudState.failed = 0;
    }
    const visual = trafficVisualFor(evt.useCaseId);
    hudState.useCases.set(evt.useCaseId, { label: visual.label, colorHex: visual.colorHex });
    if (evt.outcome === "succeeded") hudState.succeeded++;
    if (evt.outcome === "failed") hudState.failed++;

    hudEls.root.hidden = false;
    hudEls.runId.textContent = hudState.runId;
    renderLegend(hudEls.useCases, hudState.useCases);
    hudEls.counts.textContent = `${hudState.succeeded} ok / ${hudState.failed} failed`;
  }

  function connect() {
    if (typeof EventSource === "undefined") return;
    if (sseSource) { sseSource.close(); sseSource = null; }
    clearTimeout(sseRetryHandle);
    sseRetryHandle = null;

    sseSource = new EventSource(`${API_BASE}/workflow-traffic-updates`);

    sseSource.addEventListener("open", () => {
      clearTimeout(sseRetryHandle);
      sseRetryHandle = null;
    });

    sseSource.addEventListener("message", (event) => {
      try {
        const evt = JSON.parse(event.data);
        onEvent(evt);
        updateHud(evt);
      } catch {
        // Malformed traffic event — drop it; domain-state path is unaffected.
      }
    });

    sseSource.addEventListener("error", () => {
      if (sseSource) { sseSource.close(); sseSource = null; }
      sseRetryHandle = setTimeout(() => connect(), SSE_RETRY_MS);
    });
  }

  return { connect };
}
