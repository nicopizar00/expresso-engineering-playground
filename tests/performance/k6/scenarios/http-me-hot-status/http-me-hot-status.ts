// http-me-hot-status scenario — last link of the hot-status load chain.
//
// Requires the auth-tokens dataset (produced by `http-auth-login --produce
// auth-tokens`). Each iteration sends one token as the `auth` cookie to
// GET /me/hot-status and checks the response shape only — orders cool
// after ORDER_COOL_DOWN_SECONDS, so hotCount may legitimately be 0.
//
// Load: the k6 config Punch passes as `k6 run --config` (default
// options/5-iterations.json; a constant-vus soak works too). Tokens are
// reusable and the endpoint is read-only.

import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import exec from "k6/execution";
import { url } from "../../config/env";
import { hotStatusThresholds } from "../../config/thresholds";
import { buildSummaryOutputs } from "../../support/report";

interface TokenRow {
  username: string;
  token: string;
}

const tokens = new SharedArray<TokenRow>("auth-tokens", () =>
  open(__ENV.DATA_AUTH_TOKENS_CSV)
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [username, token] = line.split(",");
      return { username, token };
    }),
);

// Load shape (executor, VUs, iterations or duration) comes from the k6
// config Punch passes as `k6 run --config`: the workflow's spec.k6.config
// or an options/*.json preset. Exporting scenarios here would override it.
export const options = {
  thresholds: hotStatusThresholds,
  tags: { suite: "mini-commerce-http-me-hot-status" },
};

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

interface HotStatusBody {
  hotCount?: unknown;
  nextCoolsAt?: unknown;
  serverTime?: unknown;
}

export default function () {
  const row = tokens[exec.scenario.iterationInTest % tokens.length];
  http.cookieJar().set(url("/"), "auth", row.token);
  const res = http.get(url("/me/hot-status"));
  let body: HotStatusBody = {};
  try {
    body = res.json() as HotStatusBody;
  } catch {
    body = {};
  }
  check(res, {
    "hot-status 200": (r) => r.status === 200,
    "hotCount is a non-negative integer": () =>
      Number.isInteger(body.hotCount) && (body.hotCount as number) >= 0,
    "nextCoolsAt null exactly when hotCount is 0": () =>
      body.hotCount === 0
        ? body.nextCoolsAt === null
        : typeof body.nextCoolsAt === "string" && ISO.test(body.nextCoolsAt),
    "serverTime is ISO": () =>
      typeof body.serverTime === "string" && ISO.test(body.serverTime),
  });
  sleep(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSummary(data: any) {
  const meta = {
    title: "Mini-Commerce Hot Status",
    testType: "http-me-hot-status",
    targetUrl: url(""),
  };
  return buildSummaryOutputs(
    data,
    meta,
    "/scripts/reports/http-me-hot-status-report.html",
    "/scripts/reports/http-me-hot-status-summary.json",
  );
}
