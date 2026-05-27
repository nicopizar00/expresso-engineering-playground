// Shared k6 thresholds. Kept conservative on purpose — they exist to flag
// regressions, not to enforce a real SLO. Tighten them once the BFF runs
// against real persistence and the latency baseline is meaningful.
//
// Every scenario should import from here so thresholds evolve in one place.

export const smokeThresholds = {
  // Smoke: a single VU walking the happy path. Tolerate one transient
  // failure but nothing more, and keep p95 well under a second.
  http_req_failed: ["rate<0.01"],
  http_req_duration: ["p(95)<500"],
  checks: ["rate>0.99"],
};

export const loadThresholds = {
  // Placeholder — tuned in a later iteration once nominal load is defined.
  http_req_failed: ["rate<0.02"],
  http_req_duration: ["p(95)<800"],
  checks: ["rate>0.98"],
};

export const stressThresholds = {
  // Placeholder — stress is permitted to degrade but not error-storm.
  http_req_failed: ["rate<0.10"],
  http_req_duration: ["p(95)<2000"],
};

export const checkoutFlowThresholds = {
  // Single VU write path — no concurrency pressure. Any failure is a real bug.
  http_req_failed: ["rate<0.01"],
  http_req_duration: ["p(95)<1000"],
  checks: ["rate>0.99"],
};

export const readHeavyThresholds = {
  // Read-only baseline — 30 VUs, idempotent GETs. Used to track regression.
  http_req_failed: ["rate<0.01"],
  http_req_duration: ["p(95)<600"],
  checks: ["rate>0.99"],
};
