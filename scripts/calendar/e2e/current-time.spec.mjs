import { test, expect } from "@playwright/test";

test("current time and today's date use primary blue and track the selected timezone", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-09-10T07:03:00Z") });
  await page.goto("/scripts/calendar/e2e/surface.html");
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  const calendar = page.getByRole("region", { name: "First calendar" });
  const today = calendar.locator('[data-calendar-day-column="2026-09-10"]');
  const line = today.locator('[data-calendar-now][data-active="true"]');
  const badge = calendar.locator("[data-calendar-current-time-label]");
  await expect(line).toBeVisible();
  await expect(badge).toHaveText("12:33");
  await expect(today.locator('[data-calendar-today="2026-09-10"]')).toHaveAttribute(
    "aria-current",
    "date",
  );
  const color = await line.evaluate((element) => getComputedStyle(element).backgroundColor);
  const channels = color.match(/[\d.]+/g).map(Number);
  expect(channels[2]).toBeGreaterThan(channels[0]);
  expect(channels[2]).toBeGreaterThan(channels[1]);
  expect(
    await today
      .locator("[data-calendar-today] > span")
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe(color);
  expect(await line.evaluate((element) => getComputedStyle(element).height)).toBe("2px");
  await expect(
    calendar.locator('[data-calendar-period="1"] [data-calendar-now][data-active="false"]'),
  ).toHaveCount(6);
  const labelBox = await badge.boundingBox(),
    lineBox = await line.boundingBox();
  expect(Math.abs(labelBox.y + labelBox.height / 2 - lineBox.y)).toBeLessThan(1);
  const before = await line.evaluate((element) => parseFloat(element.style.top));
  await page.clock.fastForward(60000);
  await expect(badge).toHaveText("12:34");
  expect((await line.evaluate((element) => parseFloat(element.style.top))) - before).toBeCloseTo(
    0.8,
  );
  await calendar.getByRole("button", { name: "Toggle timezone" }).click();
  await expect(badge).toHaveText("07:04");
  await calendar.getByRole("button", { name: "month", exact: true }).click();
  await expect(calendar.locator('[data-calendar-today="2026-09-10"]')).toBeVisible();
  await calendar.getByRole("button", { name: "week", exact: true }).click();
  await page.screenshot({
    animations: "disabled",
    path: ".dev/calendar-e2e-results/current-time-blue.png",
  });
});

test("today highlights roll over at local midnight and other days have no active-time marker", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-09-09T18:29:30Z") });
  await page.goto("/scripts/calendar/e2e/surface.html");
  const calendar = page.getByRole("region", { name: "First calendar" });
  await expect(calendar.locator('[data-calendar-today="2026-09-09"]')).toBeVisible();
  await page.clock.fastForward(31000);
  await expect(calendar.locator('[data-calendar-today="2026-09-09"]')).toHaveCount(0);
  await expect(calendar.locator('[data-calendar-today="2026-09-10"]')).toBeVisible();
  await expect(
    calendar.locator('[data-calendar-day-column="2026-09-10"] [data-calendar-now]'),
  ).toHaveAttribute("data-active", "true");
  await calendar.getByRole("button", { name: "day", exact: true }).click();
  await expect(calendar.locator('[data-calendar-period="1"] [data-calendar-now]')).toHaveCount(0);
  await expect(calendar.locator("[data-calendar-current-time-label]")).toHaveCount(0);
});
