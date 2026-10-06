// Login scenario — second link of the hot-status load chain.
//
// Source of users (Punch optional dataset, spec.data.optional):
//   - owned-orders present (DATA_OWNED_ORDERS_CSV set) → the owners of
//     orders a purchase-registered run placed (username column);
//   - absent → the seeded demo users (support/demo-users.ts).
// Each iteration clears its cookie jar, logs in (a new AuthSession row each
// time), and emits `[DATA auth-tokens] <username>,<token>` from the `auth`
// cookie. The password never enters a dataset: DEMO_PASSWORD, default
// `espresso-demo`.

import http from "k6/http";
import { check, group, sleep } from "k6";
import { SharedArray } from "k6/data";
import exec from "k6/execution";
import { url } from "../../config/env";
import { loginThresholds } from "../../config/thresholds";
import { DEMO_USERS } from "../../support/demo-users";
import { buildSummaryOutputs } from "../../support/report";

declare const console: { log: (message: string) => void };

const users = new SharedArray<string>("login-users", () => {
  const path = __ENV.DATA_OWNED_ORDERS_CSV;
  if (!path) return [...DEMO_USERS];
  return open(path)
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(",")[1])
    .filter((username) => Boolean(username));
});

const PASSWORD = __ENV.DEMO_PASSWORD || "espresso-demo";
const VUS = Number(__ENV.VUS) || 1;
const ITERATIONS = __ENV.ITERATIONS ? Number(__ENV.ITERATIONS) : 5;

export const options = {
  scenarios: {
    login: {
      executor: "shared-iterations",
      vus: VUS,
      iterations: ITERATIONS,
      maxDuration: "5m",
    },
  },
  thresholds: loginThresholds,
  tags: { suite: "mini-commerce-login" },
};

const JSON_HEADERS = { "Content-Type": "application/json" };

export default function () {
  const username = users[exec.scenario.iterationInTest % users.length];
  http.cookieJar().clear(url("/"));

  group("auth: login", () => {
    const res = http.post(
      url("/auth/login"),
      JSON.stringify({ identifier: username, password: PASSWORD }),
      { headers: JSON_HEADERS },
    );
    const token = res.cookies.auth?.[0]?.value;
    const ok = check(res, {
      "login 200": (r) => r.status === 200,
      "login returns the user": (r) => {
        try {
          return r.json("username") === username;
        } catch {
          return false;
        }
      },
      "login sets auth cookie": () => Boolean(token),
    });
    if (ok && token) console.log(`[DATA auth-tokens] ${username},${token}`);
  });

  sleep(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSummary(data: any) {
  const meta = {
    title: "Mini-Commerce Login",
    testType: "login",
    targetUrl: url(""),
  };
  return buildSummaryOutputs(
    data,
    meta,
    "/scripts/reports/login-report.html",
    "/scripts/reports/login-summary.json",
  );
}
