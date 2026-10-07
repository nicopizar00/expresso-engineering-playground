// Shared k6 thresholds. Kept conservative on purpose — they exist to flag
// regressions, not to enforce a real SLO. Tighten them once the BFF runs
// against real persistence and the latency baseline is meaningful.
//
// Every scenario should import from here so thresholds evolve in one place.

export const purchaseFlowThresholds = {
  http_req_failed: ["rate<0.01"],
  http_req_duration: ["p(95)<1000"],
  checks: ["rate>0.99"],
};

// http-orders-status reads one DB-backed status per iteration; checks carry the
// temperature assertions.
export const orderStatusThresholds = {
  http_req_failed: ["rate<0.01"],
  http_req_duration: ["p(95)<500"],
  checks: ["rate>0.99"],
};

// Browser scenarios drive the UI via k6/browser — there is no k6/http
// traffic, so http_req_* metrics never populate. checks is the only
// meaningful signal.
export const purchaseFlowBrowserThresholds = {
  checks: ["rate>0.95"],
};

// Hot-status load chain (http-purchase-registered → http-auth-login → http-me-hot-status): looser
// gates than the purchase flow — up to 10% failures, p90 latency.
export const purchaseRegisteredThresholds = {
  http_req_failed: ["rate<0.10"],
  http_req_duration: ["p(90)<1000"],
  checks: ["rate>0.90"],
};

// One scrypt verification per login.
export const loginThresholds = {
  http_req_failed: ["rate<0.10"],
  http_req_duration: ["p(90)<1000"],
  checks: ["rate>0.90"],
};

export const hotStatusThresholds = {
  http_req_failed: ["rate<0.10"],
  http_req_duration: ["p(90)<500"],
  checks: ["rate>0.90"],
};
