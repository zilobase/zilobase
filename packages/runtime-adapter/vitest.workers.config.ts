import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/worker/**/*.test.ts"],
    testTimeout: 15_000,
  },
});
