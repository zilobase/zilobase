import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.mjs",
  workers: 1,
  timeout: 30000,
  outputDir: "../../../.dev/mail-e2e-results",
  use: {
    baseURL: "http://127.0.0.1:1499",
    viewport: { width: 1280, height: 900 },
    headless: true,
    channel: "chrome",
  },
  webServer: {
    command: "../../../node_modules/.bin/vite --config vite.config.mjs",
    url: "http://127.0.0.1:1499/scripts/mail/e2e/index.html",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
