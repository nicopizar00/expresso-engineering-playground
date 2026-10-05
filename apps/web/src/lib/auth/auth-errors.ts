import { ExpressoApiError } from "../api/expresso-api";

export type AuthField = "username" | "email" | "password" | "identifier";

const FIELDS: ReadonlyArray<AuthField> = [
  "username",
  "email",
  "password",
  "identifier",
];

// BFF error body: { statusCode, path, method, error: { message, field? } }.
function errorPayload(err: ExpressoApiError): {
  message?: string;
  field?: string;
} {
  const body = err.body as {
    error?: { message?: unknown; field?: unknown };
  } | null;
  const e = body?.error;
  return {
    message: typeof e?.message === "string" ? e.message : undefined,
    field: typeof e?.field === "string" ? e.field : undefined,
  };
}

const asField = (f: string | undefined): AuthField | undefined =>
  FIELDS.find((x) => x === f);

export function authErrorMessage(err: unknown): {
  field?: AuthField;
  message: string;
} {
  if (!(err instanceof ExpressoApiError)) {
    return { message: "Something went wrong. Please try again." };
  }
  const { message, field } = errorPayload(err);
  if (err.status === 401) {
    return { field: "identifier", message: "Invalid credentials" };
  }
  if (err.status === 409 && (field === "username" || field === "email")) {
    return {
      field,
      message: field === "email" ? "Email taken" : "Username taken",
    };
  }
  if (err.status === 400) {
    const f = asField(field);
    const text = message ?? "Check the highlighted field";
    return f ? { field: f, message: text } : { message: text };
  }
  return { message: message ?? `Request failed (HTTP ${err.status})` };
}
