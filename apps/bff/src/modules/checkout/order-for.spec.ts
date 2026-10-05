import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { resolveOrderOwner } from "./order-for";

const ana = { id: 1, username: "ana", email: "ana@example.test" };

describe("resolveOrderOwner", () => {
  it.each([
    ["omitted, signed in", undefined, ana, { ownerUsername: "ana" }],
    ["omitted, signed out", undefined, null, {}],
    ["self, signed in", { type: "self" }, ana, { ownerUsername: "ana" }],
    ["guest, signed in", { type: "guest" }, ana, {}],
    ["guest, signed out", { type: "guest" }, null, {}],
    [
      "user by name, signed out",
      { type: "user", recipient: " Ben " },
      null,
      { ownerUsername: "ben" },
    ],
    [
      "user by email, signed in",
      { type: "user", recipient: "Cara@Example.TEST" },
      ana,
      { ownerEmail: "cara@example.test" },
    ],
  ] as const)("%s", (_label, orderFor, user, expected) => {
    expect(resolveOrderOwner(orderFor as any, user)).toEqual(expected);
  });

  it("self while signed out is 401", () => {
    expect(() => resolveOrderOwner({ type: "self" }, null)).toThrow(
      UnauthorizedException,
    );
  });

  it.each([undefined, "", "x", "bad@"])(
    "user with recipient %j is 400",
    (recipient) => {
      expect(() =>
        resolveOrderOwner({ type: "user", recipient } as any, null),
      ).toThrow(BadRequestException);
    },
  );
});
