import { test, expect } from "@playwright/test";
const baseline = process.env.CALENDAR_BENCHMARK_BASELINE === "1";
test("10000-item surface benchmark bounds month DOM", async ({ page }, testInfo) => {
  await page.goto(`/scripts/calendar/e2e/benchmark.html?count=10000${baseline ? "&baseline" : ""}`);
  await expect(page.locator("[data-calendar-event-card]").first()).toBeVisible();
  const samples = [];
  for (const view of ["month", "day", "week"]) {
    const duration = await page.evaluate(async (view) => {
      const begin = performance.now();
      window.surfaceFixture.navigate(view);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return performance.now() - begin;
    }, view);
    samples.push({
      view,
      duration,
      cards: await page.locator("[data-calendar-event-card]").count(),
      nodes: await page.locator("main *").count(),
    });
  }
  await testInfo.attach("surface-benchmark.json", {
    body: JSON.stringify({ count: 10000, baseline, samples }),
    contentType: "application/json",
  });
  if (!baseline)
    for (const sample of samples.filter((sample) => ["month"].includes(sample.view)))
      expect(sample.cards).toBeLessThan(100);
});
test("clock ticks and unrelated updates leave event cards untouched", async ({ page }) => {
  test.skip(baseline, "Regression assertion applies to the optimized component");
  await page.clock.install();
  await page.goto("/scripts/calendar/e2e/benchmark.html?count=1000");
  await page.waitForFunction(() => Boolean(window.surfaceFixture));
  await page.evaluate(() => window.surfaceFixture.navigate("week"));
  await expect(page.locator('[data-calendar-period-ready="true"]')).toHaveCount(3);
  await page.evaluate(() => window.surfaceFixture.reset());
  await page.clock.fastForward(60000);
  expect(await page.evaluate(() => window.surfaceFixture.metrics.cards)).toBe(0);
  await page.evaluate(() => window.surfaceFixture.refresh());
  await expect(page.locator("output")).toContainText("week 1");
  expect(await page.evaluate(() => window.surfaceFixture.metrics.cards)).toBe(0);
});
test("large overflow stays bounded and keeps keyboard access", async ({ page }) => {
  test.skip(baseline, "Regression assertion applies to the optimized component");
  await page.goto("/scripts/calendar/e2e/benchmark.html?count=10000");
  await page.getByRole("button", { name: /more$/ }).first().click();
  const popup = page.locator('[data-slot="popover-content"]');
  await expect(popup.locator("[data-calendar-virtual-list]")).toBeVisible();
  await popup.locator("[data-calendar-event-card]").first().focus();
  for (let i = 0; i < 45; i++) await page.keyboard.press("Tab");
  await expect
    .poll(() =>
      popup.locator("[data-calendar-virtual-list]").evaluate((element) => element.scrollTop),
    )
    .toBeGreaterThan(0);
  expect(await popup.locator("[data-calendar-event-card]").count()).toBeLessThan(40);
});
