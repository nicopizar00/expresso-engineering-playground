// Shared ESLint flat config for the mini-commerce playground.
//
// Workspaces consume this by re-exporting from their own eslint.config.mjs:
//
//   import shared from "@mini-commerce/config/eslint.config.mjs";
//   export default shared;
//
// Adjust per-package by spreading and adding overrides.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

// Node + browser + common test globals. Inlined to avoid a `globals` dep —
// the set is small and stable.
const nodeBrowserGlobals = {
  // Node
  process: "readonly",
  console: "readonly",
  Buffer: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  module: "readonly",
  require: "readonly",
  exports: "writable",
  global: "readonly",
  // Browser / DOM (referenced by web + visualizer files)
  window: "readonly",
  document: "readonly",
  navigator: "readonly",
  fetch: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  // Timers (shared)
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  setImmediate: "readonly",
  clearImmediate: "readonly",
  queueMicrotask: "readonly",
  // Web Streams + AbortController
  AbortController: "readonly",
  AbortSignal: "readonly",
  // Common ESNext
  Promise: "readonly",
  Symbol: "readonly",
};

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/build/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      globals: nodeBrowserGlobals,
    },
    rules: {
      // Keep the bar low at first — feel free to tighten in a follow-up.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
];
