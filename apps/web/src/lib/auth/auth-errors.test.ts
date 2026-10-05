import { describe, expect, it } from "vitest";
import { ExpressoApiError } from "../api/expresso-api";
import { authErrorMessage } from "./auth-errors";

const apiErr = (status: number, error: unknown) =>
  new ExpressoApiError("POST", "/auth/x", status, {
    statusCode: status,
    error,
  });

describe("authErrorMessage", () => {
  it("maps 409 with field", () => {
    expect(
      authErrorMessage(apiErr(409, { message: "email taken", field: "email" })),
    ).toEqual({
      field: "email",
      message: "Email taken",
    });
    expect(
      authErrorMessage(
        apiErr(409, { message: "username taken", field: "username" }),
      ),
    ).toEqual({
      field: "username",
      message: "Username taken",
    });
  });
  it("maps 401 to invalid credentials", () => {
    expect(
      authErrorMessage(apiErr(401, { message: "invalid credentials" })),
    ).toEqual({
      field: "identifier",
      message: "Invalid credentials",
    });
  });
  it("passes through 400 field messages", () => {
    expect(
      authErrorMessage(
        apiErr(400, {
          message: "password must be 8-200 characters",
          field: "password",
        }),
      ),
    ).toEqual({
      field: "password",
      message: "password must be 8-200 characters",
    });
  });
  it("handles a 400 without a field", () => {
    expect(authErrorMessage(apiErr(400, { message: "too long" }))).toEqual({
      message: "too long",
    });
  });
  it("uses the server message for other statuses, and a fallback for non-API errors", () => {
    expect(
      authErrorMessage(
        apiErr(503, { message: "Accounts are not available in demo mode" }),
      ),
    ).toEqual({
      message: "Accounts are not available in demo mode",
    });
    expect(authErrorMessage(new Error("boom"))).toEqual({
      message: "Something went wrong. Please try again.",
    });
  });
});
