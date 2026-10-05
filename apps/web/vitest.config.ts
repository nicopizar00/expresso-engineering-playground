import { defineConfig } from "vitest/config";

// Pure-logic tests only (lib/**). Component behavior is covered by the
// Playwright suite in tests/e2e.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
