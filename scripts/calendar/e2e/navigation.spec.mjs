import { test, expect } from "@playwright/test";
const calendars = [
  {
    id: "primary",
    bindingId: "binding",
    name: "Personal",
    timeZone: "Asia/Kolkata",
    primary: true,
    permissions: { read: true, write: true, owner: true, freeBusyOnly: false },
    defaultReminders: [],
  },
];
async function setup(page) {
  await page.route("**/workspaces/workspace/calendar/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/catalog") || url.pathname.endsWith("/sync"))
      return route.fulfill({ json: { calendars, revisions: { primary: 1 }, pending: false } });
    if (url.pathname.endsWith("/ranges")) return complete(route);
    return route.fulfill({ json: {} });
  });
  await page.goto("/scripts/calendar/e2e/index.html");
  await expect(page.locator('[data-calendar-period-ready="true"]')).toHaveCount(3);
}
function complete(route) {
  const url = new URL(route.request().url());
  return route.fulfill({
    json: {
      calendarId: "primary",
      start: url.searchParams.get("start"),
      end: url.searchParams.get("end"),
      generation: 1,
      revision: 1,
      events: [],
      complete: true,
      nextPageToken: null,
    },
  });
}
async function holdRanges(page) {
  const held = [];
  const handler = (route) => {
    held.push(route);
  };
  await page.route("**/ranges?**", handler);
  return async (fail = false) => {
    await page.unroute("**/ranges?**", handler);
    await Promise.all(
      held
        .splice(0)
        .map((route) =>
          fail
            ? route.fulfill({ status: 503, json: { message: "Try loading again" } })
            : complete(route),
        ),
    );
  };
}
const date = (page) => page.evaluate(() => window.calendarFixture.search().date);
test("cached dates navigate during loading and uncached arrows wait for committed empty coverage", async ({
  page,
}) => {
  await setup(page);
  const release = await holdRanges(page);
  await page.getByRole("button", { name: "Next period", exact: true }).click();
  await expect.poll(() => date(page)).toBe("2026-09-16");
  await page.getByRole("button", { name: "Next period", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Loading dates…" }).first(),
  ).toBeVisible();
  expect(await date(page)).toBe("2026-09-16");
  await release();
  await expect.poll(() => date(page)).toBe("2026-09-23");
  await expect(page.locator('[data-calendar-period="1"]')).toHaveAttribute(
    "data-calendar-period-ready",
    "true",
  );
});
test("a newer cached destination cancels the old navigation intent", async ({ page }) => {
  await setup(page);
  const release = await holdRanges(page);
  await page.getByRole("button", { name: "Next period", exact: true }).click();
  await expect.poll(() => date(page)).toBe("2026-09-16");
  await page.getByRole("button", { name: "Next period", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Previous period", exact: true }).click();
  await expect.poll(() => date(page)).toBe("2026-09-09");
  await release();
  await expect(page.locator('[data-calendar-period-ready="true"]')).toHaveCount(3);
  expect(await date(page)).toBe("2026-09-09");
});
test("horizontal scrolling stops at unloaded dates while vertical hours remain usable", async ({
  page,
}) => {
  await setup(page);
  const release = await holdRanges(page);
  await page.getByRole("button", { name: "Next period", exact: true }).click();
  await expect.poll(() => date(page)).toBe("2026-09-16");
  const scroll = page.locator("[data-calendar-period-scroll]");
  await scroll.evaluate((el) => {
    el.scrollLeft = el.clientWidth * 2;
  });
  await expect
    .poll(() => scroll.evaluate((el) => Math.abs(el.scrollLeft - el.clientWidth)))
    .toBeLessThan(3);
  expect(await date(page)).toBe("2026-09-16");
  await release();
  await expect.poll(() => date(page)).toBe("2026-09-23");
});
test("uncached failed navigation stays put and supports retry", async ({ page }) => {
  await setup(page);
  const release = await holdRanges(page);
  await page.getByRole("button", { name: "Next period", exact: true }).click();
  await expect.poll(() => date(page)).toBe("2026-09-16");
  await page.getByRole("button", { name: "Next period", exact: true }).click();
  await page.route("**/ranges?**", (route) =>
    route.fulfill({ status: 503, json: { message: "Try loading again" } }),
  );
  await release(true);
  // Retry after restoring the server. The failed period must not be committed.
  expect(await date(page)).toBe("2026-09-16");
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  await page.unroute("**/ranges?**");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect.poll(() => date(page)).toBe("2026-09-23");
});
test("offline cached navigation works and uncached dates explain the boundary", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => window.calendarFixture.offline());
  await page.getByRole("button", { name: "Next period", exact: true }).click();
  await expect.poll(() => date(page)).toBe("2026-09-16");
  await page.getByRole("button", { name: "Next period", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "These dates are not cached" }),
  ).toBeVisible();
  expect(await date(page)).toBe("2026-09-16");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});
test("month scrolling holds its anchor at an unloaded boundary then resumes", async ({ page }) => {
  await setup(page);
  await page.getByRole("combobox", { name: "Calendar view" }).click();
  await page.getByRole("option", { name: "Month", exact: true }).click();
  const scroll = page.locator("[data-calendar-month-scroll]");
  await expect(scroll).toBeVisible();
  await expect(scroll.getByRole("status")).toHaveCount(0);
  const release = await holdRanges(page);
  // Move beyond the original buffer; a loaded shift is allowed, the next stops.
  await scroll.evaluate((el) => {
    el.scrollTop = el.scrollHeight - el.clientHeight - 10;
  });
  await expect
    .poll(() => scroll.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop))
    .toBeGreaterThan(300);
  const before = await scroll.evaluate((el) => ({
    top: el.scrollTop,
    week: el.querySelector("[data-calendar-week]")?.getAttribute("data-calendar-week"),
  }));
  await scroll.evaluate((el) => {
    el.scrollTop = el.scrollHeight - el.clientHeight - 10;
  });
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
  await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBe(before.top);
  await release();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);
  await expect
    .poll(() =>
      scroll.evaluate((el) =>
        el.querySelector("[data-calendar-week]")?.getAttribute("data-calendar-week"),
      ),
    )
    .not.toBe(before.week);
});
