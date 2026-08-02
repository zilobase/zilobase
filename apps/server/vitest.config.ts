import { defineConfig } from "vitest/config";

const fullCoverage = process.env.COVERAGE_FULL === "1";

export default defineConfig({
  test: {
    coverage: {
      enabled: false,
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts"],
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      // Keep every phase from lowering the all-source baseline. COVERAGE_FULL
      // switches the same suite to the final literal-100% acceptance gate.
      thresholds: {
        branches: fullCoverage ? 100 : 15,
        functions: fullCoverage ? 100 : 19,
        lines: fullCoverage ? 100 : 20,
        statements: fullCoverage ? 100 : 20,
      },
    },
    include: ["src/**/*.test.ts"],
    testTimeout: 15_000,
  },
});
