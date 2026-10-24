import { checkVerificationBrowser } from "./verification-browser.mts";
import assert from "node:assert/strict";
import { createServer as createReservation } from "node:net";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
export async function runSearchBrowser({
  runtime,
  env,
  jar,
  workspace,
  pageId,
  backgroundPageId,
  ready,
}) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const reservation = createReservation();
  await new Promise<void>((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const port = reservation.address().port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const origin = `http://127.0.0.1:${port}`;
  await runtime.updateEnv({ CLIENT_URL: `${runtime.origin},${origin}` });
  process.env.VITE_BACKEND_PROXY_TARGET = runtime.origin;
  process.env.VITE_API_URL = runtime.origin;
  const require = createRequire(`${root}apps/web/package.json`);
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  const vite = await createServer({
    root: `${root}apps/web`,
    configFile: `${root}apps/web/vite.config.ts`,
    envDir: false,
    cacheDir: `${root}.dev/search-app-cache`,
    server: { host: "127.0.0.1", port, strictPort: true, open: false },
  });
  let browser, page;
  const requests = [];
  const responses = [];
  const checks = [];
  const pending = new Set<Promise<unknown>>();
  const timer = setInterval(() => {
    const work = runtime.maintenance().catch(() => {});
    pending.add(work);
    void work.finally(() => pending.delete(work));
  }, 1000);
  try {
    await vite.listen();
    browser = await chromium.launch({
      headless: true,
      ...(process.platform === "darwin" ? { channel: "chrome" } : {}),
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addCookies(
      [...jar.cookies].map(([name, value]) => ({ name, value, url: origin })),
    );
    page = await context.newPage();
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname === "/search")
        requests.push({
          query: url.searchParams.get("q"),
          mode: url.searchParams.get("mode"),
          types: url.searchParams.get("types"),
        });
    });
    page.on("response", async (response) => {
      if (new URL(response.url()).pathname === "/search") {
        const data = await response.json().catch(() => null);
        responses.push({
          query: new URL(response.url()).searchParams.get("q"),
          status: response.status(),
          count: data?.results?.length,
          metadata: data?.metadata,
        });
      }
    });
    await page.goto(`${origin}/settings/workspace`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Semantic search", exact: true })).toBeVisible({
      timeout: 60000,
    });
    await expect(
      page.getByRole("button", { name: "Disable semantic search", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Disable semantic search", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Enable semantic search", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Enable semantic search", exact: true }).click();
    await ready(pageId);
    await expect(page.getByRole("button", { name: "Reindex workspace", exact: true })).toBeEnabled({
      timeout: 20000,
    });
    await page.getByRole("button", { name: "Reindex workspace", exact: true }).click();
    await ready(pageId);
    checks.push("workspace enable/disable/reindex through shared client");
    await page.screenshot({ path: ".test-results/search/browser-settings.png" });
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Customize sidebar", exact: true })).toBeVisible({
      timeout: 60000,
    });
    await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
    await page.getByPlaceholder("Search pages and databases...").fill("Underwater");
    const option = page.getByRole("option").filter({ hasText: "Underwater expedition" });
    await expect
      .poll(() => requests.some((r) => r.query === "Underwater" && r.mode === "keyword"))
      .toBe(true);
    await expect(option).toBeVisible({ timeout: 20000 });
    assert.ok(requests.some((r) => r.query === "Underwater" && r.mode === "keyword"));
    await page.screenshot({ path: ".test-results/search/browser-search.png" });
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.getByPlaceholder("Search pages and databases...")).not.toBeVisible();
    checks.push("global keyword search and keyboard navigation");
    await page.getByRole("button", { name: "Customize sidebar", exact: true }).click();
    await page.getByRole("button", { name: "Add shortcut", exact: true }).click();
    await page.getByText("Page", { exact: true }).last().hover();
    const picker = page.getByPlaceholder("Search pages...", { exact: true });
    await expect(picker).toBeVisible();
    await picker.fill("Underwater");
    await expect
      .poll(() => requests.filter((r) => r.query === "Underwater" && r.mode === "keyword").length)
      .toBeGreaterThan(0);
    checks.push("sidebar page picker requests keyword mode");
    await page.screenshot({ path: ".test-results/search/browser-picker.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press("Escape");
    await page.goto(`${origin}/settings/workspace`, { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "Semantic search", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("button", { name: "Disable semantic search", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Disable semantic search", exact: true })
      .scrollIntoViewIfNeeded();
    const controlBounds = await page
      .getByRole("button", { name: "Disable semantic search", exact: true })
      .boundingBox();
    assert.ok(
      controlBounds &&
        controlBounds.x >= 0 &&
        controlBounds.x + controlBounds.width <= 391 &&
        controlBounds.y + controlBounds.height <= 845,
    );
    await page.screenshot({ path: ".test-results/search/browser-mobile-settings.png" });
    await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
    await page.getByPlaceholder("Search pages and databases...").fill("Underwater");
    await expect(page.getByRole("option").filter({ hasText: "Underwater expedition" })).toBeVisible(
      { timeout: 20000 },
    );
    const bounds = await page.getByRole("dialog", { name: "Search", exact: true }).boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 391);
    await page.screenshot({ path: ".test-results/search/browser-mobile-search.png" });
    checks.push("mobile settings and keyword results fit a 390px viewport");
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await checkVerificationBrowser(page, { origin, pageId, backgroundPageId });
    checks.push(
      "verification lifecycle, failures, readers, expiry, main/pane/dialog presentations",
    );
    console.info(`Search browser acceptance passed (${checks.length} checks).`);
  } catch (error) {
    const diagnostics = await page
      ?.evaluate(async () => {
        const { queryClient } = await import("/src/app/query-client.ts");
        return queryClient
          .getQueryCache()
          .getAll()
          .filter((q) => q.queryKey[0] === "search")
          .map((q) => ({
            key: q.queryKey,
            status: q.state.status,
            data: q.state.data,
            error:
              q.state.error instanceof Error
                ? { message: q.state.error.message, stack: q.state.error.stack }
                : q.state.error,
          }));
      })
      .catch(() => null);
    await writeFile(
      ".test-results/search/browser-query-diagnostics.json",
      JSON.stringify(diagnostics, null, 2),
    );
    await page?.screenshot({ path: ".test-results/search/browser-failure.png" });
    await writeFile(
      ".test-results/search/browser-failure.txt",
      (await page?.locator("body").innerText()) ?? "",
    );
    throw error;
  } finally {
    clearInterval(timer);
    await Promise.allSettled(pending);
    await browser?.close();
    await vite.close();
    await mkdir(".test-results/search", { recursive: true });
    await writeFile(
      ".test-results/search/browser-acceptance.json",
      JSON.stringify({ checks, requests, responses }, null, 2),
    );
  }
}
