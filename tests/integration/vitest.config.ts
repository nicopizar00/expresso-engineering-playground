import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// SWC handles the TS + Nest decorator/metadata transform — services
// instantiated in tests carry @Injectable() that esbuild would choke on.
export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.spec.ts"],
    // Integration tests share a single Postgres DB; running them in parallel
    // would clobber each other's TRUNCATE in beforeEach.
    fileParallelism: false,
    sequence: { concurrent: false },
    // Real DB + per-test rebuilds + parallel-checkout assertions need
    // headroom over the default 5s.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: "es2022",
      },
    }),
  ],
});
