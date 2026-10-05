"use client";

/**
 * SignInDialog - modal with Sign in / Register tabs. Field errors come from
 * the client mirror of the BFF identity rules first, then from the server
 * (authErrorMessage). On success it closes; the parent page reacts to the
 * user change (see app/page.tsx).
 */

import { useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { useDialogA11y } from "@/lib/hooks/useDialogA11y";
import { authErrorMessage, type AuthField } from "@/lib/auth/auth-errors";
import {
  isValidPassword,
  normalizeEmail,
  normalizeUsername,
} from "@/lib/auth/identity";
import { useAuth } from "./AuthProvider";

type Tab = "signin" | "register";

export function SignInDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { login, register } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  useDialogA11y({ open, onClose, containerRef });

  const [tab, setTab] = useState<Tab>("signin");
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<{
    field?: AuthField;
    message: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  function clientCheck(): { field: AuthField; message: string } | null {
    if (tab === "signin") {
      if (!identifier.trim())
        return { field: "identifier", message: "Enter your username or email" };
      if (!password)
        return { field: "password", message: "Enter your password" };
      return null;
    }
    if (!normalizeUsername(username))
      return {
        field: "username",
        message: "Username: 3-32 chars of a-z, 0-9, . _ -",
      };
    if (!normalizeEmail(email))
      return { field: "email", message: "Enter a valid email" };
    if (!isValidPassword(password))
      return { field: "password", message: "Password: 8-200 characters" };
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const local = clientCheck();
    if (local) {
      setError(local);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (tab === "signin") await login({ identifier, password });
      else await register({ username, email, password });
      setPassword("");
      onClose();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const field = (
    id: AuthField,
    label: string,
    value: string,
    set: (v: string) => void,
    type = "text",
    autoComplete?: string,
  ) => (
    <label
      className="block space-y-1 text-sm"
      style={{ color: "var(--foreground)" }}
    >
      <span>{label}</span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(ev) => set(ev.target.value)}
        aria-invalid={error?.field === id ? "true" : undefined}
        className="w-full rounded-md border px-3 py-2 text-sm bg-transparent"
        style={{
          borderColor:
            error?.field === id ? "var(--destructive)" : "var(--border)",
        }}
      />
    </label>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Account"
        tabIndex={-1}
        data-testid="signin-dialog"
        className="w-full max-w-sm rounded-lg border p-4 space-y-4"
        style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between">
          <div role="tablist" aria-label="Account mode" className="flex gap-1">
            {(["signin", "register"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => {
                  setTab(t);
                  setError(null);
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium ${tab === t ? "tone-primary" : "tone-muted"}`}
              >
                {t === "signin" ? "Sign in" : "Register"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="tone-muted rounded-md p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          {tab === "signin" ? (
            <>
              {field(
                "identifier",
                "Username or email",
                identifier,
                setIdentifier,
                "text",
                "username",
              )}
              {field(
                "password",
                "Password",
                password,
                setPassword,
                "password",
                "current-password",
              )}
            </>
          ) : (
            <>
              {field(
                "username",
                "Username",
                username,
                setUsername,
                "text",
                "username",
              )}
              {field("email", "Email", email, setEmail, "email", "email")}
              {field(
                "password",
                "Password",
                password,
                setPassword,
                "password",
                "new-password",
              )}
            </>
          )}
          {error && (
            <p
              role="alert"
              className="text-sm"
              style={{ color: "var(--destructive)" }}
            >
              {error.message}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium tone-primary disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {tab === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
