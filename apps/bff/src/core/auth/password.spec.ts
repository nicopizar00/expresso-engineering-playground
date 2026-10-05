import { describe, expect, it } from "vitest";
import { dummyHash, hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("round-trips and uses the documented format", async () => {
    const stored = await hashPassword("espresso-demo");
    expect(stored).toMatch(
      /^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/,
    );
    await expect(verifyPassword("espresso-demo", stored)).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const stored = await hashPassword("espresso-demo");
    await expect(verifyPassword("espresso-demO", stored)).resolves.toBe(false);
  });

  it("salts each hash", async () => {
    const [a, b] = await Promise.all([
      hashPassword("same"),
      hashPassword("same"),
    ]);
    expect(a).not.toBe(b);
  });

  it.each(["", "plain", "scrypt$1$2$3$x", "bcrypt$16384$8$1$AA==$AA=="])(
    "returns false for malformed stored value %j",
    async (stored) => {
      await expect(verifyPassword("anything", stored)).resolves.toBe(false);
    },
  );

  it("memoizes a dummy hash that never matches a guess", async () => {
    const a = await dummyHash();
    expect(await dummyHash()).toBe(a);
    await expect(verifyPassword("espresso-demo", a)).resolves.toBe(false);
  });
});
