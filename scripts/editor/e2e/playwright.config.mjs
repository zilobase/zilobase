import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.mjs",
  workers: 1,
  timeout: 30_000,
  outputDir: "../../../.dev/editor-e2e-results",
  use: {
    baseURL: "http://127.0.0.1:1502",
    viewport: { width: 1400, height: 900 },
    headless: true,
    channel: "chrome",
  },
  webServer: {
    command: "../../../node_modules/.bin/vite --config vite.config.mjs",
    url: "http://127.0.0.1:1502/scripts/editor/e2e/index.html",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
