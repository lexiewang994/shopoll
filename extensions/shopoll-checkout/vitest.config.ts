import {defineConfig} from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "preact",
  },
  test: {
    environment: "jsdom",
    isolate: true,
    testTimeout: 8_000,
  },
});
