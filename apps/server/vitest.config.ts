import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      enabled: false,
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts"],
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      // Measure every backend source file and keep each pass from lowering the
      // all-source baseline. The full command uses this same no-exemption gate.
      thresholds: {
        branches: 35,
        functions: 38,
        lines: 38,
        statements: 38,
      },
    },
    include: ["src/**/*.test.ts"],
    testTimeout: 15_000,
  },
});
