import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  root: fileURLToPath(new URL("../../", import.meta.url)),
  optimizeDeps: { entries: ["scripts/data/shared-cache-fixture.html"] },
  server: { host: "127.0.0.1", port: 1500, strictPort: true },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:1500/scripts/data/shared-cache-fixture.html");
  for (const name of ["sidebar", "database", "panel"])
    await expect(page.getByTestId(name)).toHaveText("Original/Status");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  for (const name of ["sidebar", "database", "panel"])
    await expect(page.getByTestId(name)).toHaveText("Shared/State");
  await page.getByRole("button", { name: "Inspect", exact: true }).click();
  const renders = JSON.parse(await page.locator("#renders").textContent());
  assert(renders.includes("Shared/State"));
  assert(
    renders.every((render) => ["Original/Status", "Shared/State"].includes(render)),
    JSON.stringify(renders),
  );
  assert.deepEqual(errors, []);
  console.info(
    "Mounted shared consumers render coherent multi-collection publications; empty reads preserve them.",
  );
} finally {
  await browser?.close();
  await server.close();
}
