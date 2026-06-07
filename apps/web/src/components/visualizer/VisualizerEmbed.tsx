"use client";

import { useState, useEffect, useCallback } from "react";
import { ExternalLink, RefreshCw, XCircle, Layers } from "lucide-react";

const EMBED_PATH = "/viz/index.html";
const STANDALONE_URL = process.env.NEXT_PUBLIC_VISUALIZER_URL || "";

type IframeStatus = "loading" | "loaded" | "error" | "not-configured";

interface VisualizerEmbedProps {
  /** When true, appends ?embed=1 so the visualizer hides its HUD. */
  embed?: boolean;
  /** CSS aspect-ratio for the iframe container (e.g. '4 / 3', '16 / 10'). */
  aspectRatio?: string;
  /** Optional className applied to the outer card. */
  className?: string;
  /** Show the small panel header with title + reload + open-standalone buttons. */
  showHeader?: boolean;
  /** Header title displayed when showHeader is true. */
  title?: string;
  /**
   * Compact header buttons. Defaults to the value of `embed` — homepage uses
   * tight 25-ish px controls, the standalone /visualizer page uses the
   * roomier 32+ px controls the visual-integrity suite expects.
   */
  compact?: boolean;
}

export function VisualizerEmbed({
  embed = false,
  aspectRatio = "16 / 10",
  className,
  showHeader = true,
  title = "Hello Room Scene",
  compact,
}: VisualizerEmbedProps) {
  const isCompact = compact ?? embed;
  const buttonClass = isCompact
    ? "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors"
    : "flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors";
  const buttonIconSize = isCompact ? "h-3 w-3" : "h-3.5 w-3.5";
  const [iframeStatus, setIframeStatus] = useState<IframeStatus>("loading");
  const [retryCount, setRetryCount] = useState(0);

  const handleLoad = useCallback(() => setIframeStatus("loaded"), []);
  const handleError = useCallback(() => setIframeStatus("error"), []);
  const handleRetry = useCallback(() => {
    setIframeStatus("loading");
    setRetryCount((c) => c + 1);
  }, []);

  // Iframes do not fire onError for proxy 4xx/5xx, so guard against an
  // infinite spinner: if the embed hasn't reported a load within a generous
  // window, flip to the actionable error state.
  useEffect(() => {
    if (iframeStatus !== "loading") return;
    const timeout = setTimeout(() => {
      setIframeStatus((current) => (current === "loading" ? "error" : current));
    }, 12_000);
    return () => clearTimeout(timeout);
  }, [iframeStatus, retryCount]);

  const src = embed ? `${EMBED_PATH}?embed=1` : EMBED_PATH;

  return (
    <div
      className={`rounded-lg border overflow-hidden ${className ?? ""}`}
      style={{
        backgroundColor: "var(--card)",
        borderColor: "var(--border)",
      }}
      data-testid="visualizer-embed"
    >
      {showHeader && (
        <div
          className="flex items-center justify-between px-3 py-2 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Layers
              className="h-4 w-4 shrink-0"
              style={{ color: "var(--muted-foreground)" }}
            />
            <span
              className="font-medium text-xs truncate"
              style={{ color: "var(--foreground)" }}
            >
              {title}
            </span>
            <StatusBadge status={iframeStatus} />
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleRetry}
              className={buttonClass}
              style={{
                backgroundColor: "var(--secondary)",
                color: "var(--muted-foreground)",
              }}
              title="Reload visualizer"
              aria-label="Reload visualizer"
            >
              <RefreshCw className={buttonIconSize} />
              <span className="hidden sm:inline">Reload</span>
            </button>
            <a
              href={STANDALONE_URL || src}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass}
              style={{
                backgroundColor: "var(--primary)",
                color: "var(--primary-foreground)",
              }}
              title="Open visualizer standalone"
              aria-label="Open Standalone"
            >
              <ExternalLink className={buttonIconSize} />
              <span className="hidden sm:inline">Open Standalone</span>
            </a>
          </div>
        </div>
      )}

      <div className="relative" style={{ aspectRatio }}>
        {iframeStatus === "error" ? (
          <ErrorState onRetry={handleRetry} />
        ) : (
          <>
            {iframeStatus === "loading" && <LoadingOverlay />}
            <iframe
              key={retryCount}
              src={src}
              className="w-full h-full border-0"
              title="3D Visualizer - Hello Room"
              onLoad={handleLoad}
              onError={handleError}
              sandbox="allow-scripts allow-same-origin"
              loading="lazy"
              data-testid="visualizer-iframe"
            />
          </>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: IframeStatus }) {
  const config = {
    loading: { label: "Loading", color: "var(--warning)" },
    loaded: { label: "Connected", color: "var(--success)" },
    error: { label: "Error", color: "var(--destructive)" },
    "not-configured": {
      label: "Not Configured",
      color: "var(--muted-foreground)",
    },
  }[status];

  return (
    <span
      className="px-1.5 py-0.5 text-[10px] font-medium rounded-full"
      style={{
        backgroundColor: `color-mix(in srgb, ${config.color} 15%, transparent)`,
        color: config.color,
      }}
      data-testid="visualizer-status"
    >
      {config.label}
    </span>
  );
}

function LoadingOverlay() {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ backgroundColor: "var(--background)" }}
    >
      <div className="text-center">
        <RefreshCw
          className="h-6 w-6 animate-spin mx-auto mb-2"
          style={{ color: "var(--primary)" }}
        />
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          Loading 3D Visualizer…
        </p>
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center p-4"
      style={{ backgroundColor: "var(--secondary)" }}
    >
      <div className="text-center max-w-xs">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3"
          style={{
            backgroundColor: "var(--destructive)",
            color: "var(--destructive-foreground)",
          }}
        >
          <XCircle className="h-5 w-5" />
        </div>
        <h3
          className="font-semibold text-sm mb-1"
          style={{ color: "var(--foreground)" }}
        >
          Visualizer unavailable
        </h3>
        <p
          className="text-xs mb-3"
          style={{ color: "var(--muted-foreground)" }}
        >
          Start it with <code>./dev up viz</code> (or <code>full</code>).
        </p>
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors"
            style={{
              backgroundColor: "var(--primary)",
              color: "var(--primary-foreground)",
            }}
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
          {STANDALONE_URL && (
            <a
              href={STANDALONE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors"
              style={{
                backgroundColor: "var(--card)",
                color: "var(--foreground)",
              }}
            >
              <ExternalLink className="h-3 w-3" />
              Standalone
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
