// Resolve the test target from environment variables.
//
// BASE_URL is the single contract between this folder and the rest of the
// playground. Defaults are chosen so a fresh checkout works locally without
// any setup.

export const BASE_URL = __ENV.BASE_URL || "http://localhost:3001";
export const K6_ENV = __ENV.K6_ENV || "local";

export function url(path) {
  return `${BASE_URL}${path}`;
}
