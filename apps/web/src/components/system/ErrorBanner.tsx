import { AlertTriangle, RefreshCw } from "lucide-react";

export function PageErrorState({
  title = "Something went wrong",
  message = "We encountered an error loading this page.",
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center py-24 px-4 text-center"
      role="alert"
    >
      <div
        className="flex items-center justify-center w-16 h-16 rounded-full mb-4"
        style={{ backgroundColor: "rgba(239, 68, 68, 0.1)" }}
      >
        <AlertTriangle
          className="w-8 h-8"
          style={{ color: "var(--destructive)" }}
          aria-hidden="true"
        />
      </div>

      <h3
        className="text-lg font-semibold mb-2"
        style={{ color: "var(--foreground)" }}
      >
        {title}
      </h3>

      <p
        className="max-w-md text-sm mb-6"
        style={{ color: "var(--muted-foreground)" }}
      >
        {message}
      </p>

      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors"
          style={{
            backgroundColor: "var(--primary)",
            color: "var(--primary-foreground)",
          }}
        >
          <RefreshCw className="h-4 w-4" />
          Try Again
        </button>
      )}
    </div>
  );
}
