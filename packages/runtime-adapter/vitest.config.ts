import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Workerd-only room tests live in test/worker/workers/ and run under
    // vitest.workers.config.ts (cloudflare pool). Everything else runs here.
    exclude: ["test/worker/workers/**", "**/node_modules/**"],
    include: ["test/**/*.test.ts"],
    testTimeout: 15_000,
  },
});
