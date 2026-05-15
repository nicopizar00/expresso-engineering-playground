import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// SWC handles the TS + decorator/metadata transform that Vite's default
// esbuild loader cannot. Required for Nest controllers/services in tests.
export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
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
