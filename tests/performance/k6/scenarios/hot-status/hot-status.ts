// Hot-status scenario — last link of the hot-status load chain.
//
// Requires the auth-tokens dataset (produced by `login --produce
// auth-tokens`). Each iteration sends one token as the `auth` cookie to
// GET /me/hot-status and checks the response shape only — orders cool
// after ORDER_COOL_DOWN_SECONDS, so hotCount may legitimately be 0.
//
// Load: ITERATIONS (default 5, shared-iterations) or DURATION (constant-vus
// soak). Tokens are reusable and the endpoint is read-only.

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

const VUS = Number(__ENV.VUS) || 1;
const DURATION = __ENV.DURATION || "30s";
const ITERATIONS = __ENV.ITERATIONS
  ? Number(__ENV.ITERATIONS)
  : __ENV.DURATION
    ? undefined
    : 5;

const scenario = ITERATIONS
  ? {
      executor: "shared-iterations",
      vus: VUS,
      iterations: ITERATIONS,
      maxDuration: "5m",
    }
  : { executor: "constant-vus", vus: VUS, duration: DURATION };

export const options = {
  scenarios: { hot_status: scenario },
  thresholds: hotStatusThresholds,
  tags: { suite: "mini-commerce-hot-status" },
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
    testType: "hot-status",
    targetUrl: url(""),
  };
  return buildSummaryOutputs(
    data,
    meta,
    "/scripts/reports/hot-status-report.html",
    "/scripts/reports/hot-status-summary.json",
  );
}
