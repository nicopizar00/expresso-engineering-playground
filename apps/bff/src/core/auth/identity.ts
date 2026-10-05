// Identity rules for the login feature. One source of truth for register,
// login, and checkout's "order for" recipient, so " Ana " and "ana" always
// mean the same user. apps/web/src/lib/auth/identity.ts mirrors these rules
// for inline form feedback — keep the two in sync.

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const EMAIL_MAX = 254;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

export type Recipient =
  | { readonly username: string }
  | { readonly email: string };

export function normalizeUsername(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  return USERNAME_RE.test(value) ? value : null;
}

export function normalizeEmail(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  return value.length <= EMAIL_MAX && EMAIL_RE.test(value) ? value : null;
}

export function parseRecipient(raw: string): Recipient | null {
  if (raw.includes("@")) {
    const email = normalizeEmail(raw);
    return email ? { email } : null;
  }
  const username = normalizeUsername(raw);
  return username ? { username } : null;
}

// Passwords are never trimmed or case-folded.
export function isValidPassword(raw: string): boolean {
  return raw.length >= PASSWORD_MIN && raw.length <= PASSWORD_MAX;
}
