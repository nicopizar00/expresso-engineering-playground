// Dependency-free cookie lookup shared by the `sid` (SessionService) and
// `auth` (AuthSessionService) cookies. The BFF reads only these two, so a
// small parse beats wiring cookie-parser middleware.
export function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) {
    return undefined;
  }
  const prefix = `${name}=`;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      const value = trimmed.slice(prefix.length);
      return value.length > 0 ? decodeURIComponent(value) : undefined;
    }
  }
  return undefined;
}
