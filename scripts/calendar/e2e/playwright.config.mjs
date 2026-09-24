import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.mjs",
  workers: 1,
  timeout: 30000,
  outputDir: "../../../.dev/calendar-e2e-results",
  use: {
    baseURL: "http://127.0.0.1:1498",
    viewport: { width: 1280, height: 900 },
    headless: true,
    channel: "chrome",
  },
  webServer: {
    command: "../../../node_modules/.bin/vite --config vite.config.mjs",
    url: "http://127.0.0.1:1498/scripts/calendar/e2e/index.html",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
