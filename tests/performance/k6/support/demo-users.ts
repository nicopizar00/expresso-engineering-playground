// Seeded demo users — mirror of apps/bff/prisma/seed.ts. All share the
// password `espresso-demo` (DEMO_PASSWORD in the login scenario).
export const DEMO_USERS: readonly string[] = [
  "ana",
  "ben",
  "dario",
  "elena",
  "felix",
  "gia",
  "hugo",
  "iris",
  "jonas",
  "kira",
  "leo",
  "mila",
];

export function demoUserEmail(username: string): string {
  return `${username}@example.test`;
}

// USERS=ana,ben narrows the pool; blanks are dropped; empty → all demo users.
export function parseUsers(raw: string | undefined): string[] {
  const picked = (raw ?? "")
    .split(",")
    .map((u) => u.trim().toLowerCase())
    .filter((u) => u.length > 0);
  return picked.length > 0 ? picked : [...DEMO_USERS];
}
