// scrypt password hashing on node:crypto (no new dependency). Parameters are
// embedded in the stored string so they can be raised later without a
// migration: "scrypt$N$r$p$<salt b64>$<hash b64>".
import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

const N = 16384;
const R = 8;
const P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 64;
// 128 * N * r = 16 MiB; leave headroom above Node's 32 MiB default.
const MAXMEM = 64 * 1024 * 1024;

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(password, salt, KEY_BYTES, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM,
  });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts as [
    string, string, string, string, string, string,
  ];
  const expected = Buffer.from(hashB64, "base64");
  if (expected.length === 0) return false;
  try {
    const key = await scryptAsync(
      password,
      Buffer.from(saltB64, "base64"),
      expected.length,
      { N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM },
    );
    return timingSafeEqual(key, expected);
  } catch {
    // Invalid parameters in a corrupted row: treat as a mismatch.
    return false;
  }
}

// Login runs one real comparison even for an unknown identifier, so response
// time does not reveal whether the account exists.
let dummy: Promise<string> | undefined;
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(32).toString("base64"));
  return dummy;
}
