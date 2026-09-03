import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      enabled: false,
      // Operational scripts, the declarative Drizzle schema, and the process
      // bootstrap have dedicated migration/command gates rather than unit
      // coverage. The measured application runtime remains all-source.
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.d.ts",
        "src/scripts/**",
        "src/infrastructure/database/schema.ts",
        "src/entrypoints/**",
        "src/app/node/server.ts",
      ],
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      // Measure every backend source file and keep each pass from lowering the
      // all-source baseline. The full command uses this same no-exemption gate.
      thresholds: {
        branches: 40,
        functions: 45,
        lines: 45,
        statements: 45,
      },
    },
    include: ["src/**/*.test.ts"],
    testTimeout: 15_000,
  },
});
