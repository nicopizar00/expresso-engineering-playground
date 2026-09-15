// tests/performance/k6/support/report.ts
//
// Thin re-export of punch's shared k6 reporting helpers (submodule at
// vendor/punch/). Every scenario imports from this short, stable local
// path instead of repeating the deep vendor/ relative path — see
// docs/specs/punch-submodule-integration.md INT-003.
export * from "../../../../vendor/punch/src/tests/support/report";
