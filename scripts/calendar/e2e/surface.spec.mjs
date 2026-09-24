import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/scripts/calendar/e2e/surface.html");
});
test("plain items render without providers and instances navigate independently", async ({
  page,
}) => {
  const first = page.getByRole("region", { name: "First calendar" }),
    second = page.getByRole("region", { name: "Second calendar" });
  await expect(first.getByRole("button", { name: /Plain meeting/ }).first()).toBeVisible();
  await first
    .getByRole("button", { name: /Plain meeting/ })
    .first()
    .click();
  await expect(first.locator("output")).toContainText("selected:meeting");
  await expect(second.locator("output")).not.toContainText("selected:");
  for (const view of ["month", "day", "week"]) {
    await first.getByRole("button", { name: view, exact: true }).click();
    await expect(first.getByRole("button", { name: /Plain meeting/ }).first()).toBeVisible();
    await expect(second.locator("[data-calendar-period-scroll]")).toHaveCount(1);
  }
});
test("read-only items do not expose drag handles", async ({ page }) => {
  const first = page.getByRole("region", { name: "First calendar" });
  await first.getByRole("button", { name: "month", exact: true }).click();
  const item = first.getByRole("button", { name: "Read only", exact: true });
  await expect(item).toBeVisible();
  await expect(item).toHaveAttribute("draggable", "false");
  await expect(item.locator("..").locator("[data-resize]")).toHaveCount(0);
});
test("native month drops cross weeks but never cross calendar instances", async ({ page }) => {
  const first = page.getByRole("region", { name: "First calendar" }),
    second = page.getByRole("region", { name: "Second calendar" });
  for (const calendar of [first, second])
    await calendar.getByRole("button", { name: "month", exact: true }).click();
  const source = first.getByRole("button", { name: /Plain meeting/ });
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent("dragstart", { dataTransfer: transfer });
  await second
    .locator('[data-calendar-week="2026-09-14"]')
    .getByRole("button", { name: "14", exact: true })
    .locator("..")
    .dispatchEvent("drop", { dataTransfer: transfer });
  await expect(second.locator("output")).not.toContainText("changed:");
  await first
    .locator('[data-calendar-week="2026-09-14"]')
    .getByRole("button", { name: "14", exact: true })
    .locator("..")
    .dispatchEvent("drop", { dataTransfer: transfer });
  await expect(first.locator("output")).toContainText("changed:meeting");
  await expect(
    first
      .locator('[data-calendar-week="2026-09-14"]')
      .getByRole("button", { name: /Plain meeting/ }),
  ).toBeVisible();
});
test("slot creation supports keyboard and pointer cancellation never writes", async ({ page }) => {
  const first = page.getByRole("region", { name: "First calendar" });
  await first.getByRole("button", { name: "Create event 2026-09-09 10:00", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(first.locator("output")).toContainText("created:2026-09-09:10:30");
  const card = first.getByRole("button", { name: /Plain meeting/ }).first();
  const box = await card.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 24);
  await card.locator("..").dispatchEvent("pointercancel");
  await page.mouse.up();
  await expect(first.locator("output")).not.toContainText("changed:");
});
test("display preferences change independently and preserve event instants", async ({ page }) => {
  const first = page.getByRole("region", { name: "First calendar" }),
    second = page.getByRole("region", { name: "Second calendar" });
  await first.getByRole("button", { name: "Toggle weekends" }).click();
  await expect(first.locator("[data-calendar-date-header]")).toHaveCount(15);
  await expect(second.locator("[data-calendar-date-header]")).toHaveCount(21);
  await first.getByRole("button", { name: "Toggle timezone" }).click();
  await expect(first.getByRole("button", { name: /Plain meeting/ }).first()).toContainText(
    "04:30–05:30",
  );
  await expect(second.getByRole("button", { name: /Plain meeting/ }).first()).toContainText(
    "10:00–11:00",
  );
  await first.getByRole("button", { name: "Toggle weekends" }).click();
  await first.getByRole("button", { name: "Start Sunday" }).click();
  await expect(
    first
      .locator('[data-calendar-period="1"]')
      .getByRole("button", { name: "Create event 2026-09-06 9:00", exact: true }),
  ).toBeAttached();
});
test("pointer bursts produce one preview update and cancel pending work", async ({
  page,
}, testInfo) => {
  const first = page.getByRole("region", { name: "First calendar" });
  const card = first.getByRole("button", { name: /Plain meeting/ }).first();
  await expect(first.locator('[data-calendar-period-ready="true"]')).toHaveCount(3);
  await expect(card).toBeVisible();
  await card.hover(); // Wait for actionable, stable geometry before capturing raw pointer coordinates.
  const box = await card.boundingBox();
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  const result = await card.locator("..").evaluate(async (element, point) => {
    // Settle the browser capture transition before measuring the synthetic burst.
    element.setPointerCapture(1);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    let writes = 0;
    const observer = new MutationObserver(() => {
      writes++;
    });
    observer.observe(element, { attributes: true, attributeFilter: ["style"] });
    const begin = performance.now();
    for (let i = 1; i <= 100; i++)
      element.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 1,
          buttons: 1,
          clientX: point.x,
          clientY: point.y + i * 0.24,
        }),
      );
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    observer.disconnect();
    return {
      moves: 100,
      writes,
      elapsed: performance.now() - begin,
      transform: element.style.transform,
    };
  }, point);
  expect(result.writes).toBe(1);
  expect(result.transform).toContain("24px");
  await card.locator("..").dispatchEvent("pointercancel");
  await page.mouse.up();
  await expect(first.locator("output")).not.toContainText("changed:");
  await testInfo.attach("drag-preview.json", {
    body: JSON.stringify(result),
    contentType: "application/json",
  });
});
test("day and week compose complete columns and use an icon-only disclosure", async ({ page }) => {
  const first = page.getByRole("region", { name: "First calendar" });
  const active = first.locator('[data-calendar-period="1"]');
  await expect(active.locator("[data-calendar-day-column]")).toHaveCount(7);
  for (const column of await active.locator("[data-calendar-day-column]").all()) {
    await expect(column.locator(":scope > [data-calendar-column-header]")).toHaveCount(1);
    await expect(column.locator(":scope > [data-calendar-scroll]")).toHaveCount(1);
  }
  const bodies = active.locator("[data-calendar-scroll]");
  await bodies.nth(3).evaluate((element) => {
    element.scrollTop = 240;
  });
  await expect
    .poll(() =>
      bodies.evaluateAll((elements) => elements.every((element) => element.scrollTop === 240)),
    )
    .toBe(true);
  const toggle = first.locator("[data-calendar-all-day-toggle]");
  await expect(toggle).toHaveText("");
  await expect(toggle.locator("svg")).toHaveCount(2);
  await expect(toggle).toHaveAttribute("data-direction", "inward");
  await toggle.hover();
  expect(await toggle.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
    "rgba(0, 0, 0, 0)",
  );
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toHaveAttribute("data-direction", "outward");
  await expect.poll(() => bodies.first().evaluate((element) => element.scrollTop)).toBe(240);
  await toggle.click();
  await expect(toggle).toHaveAttribute("data-direction", "inward");
  await first.getByRole("button", { name: "day", exact: true }).click();
  await expect(active.locator("[data-calendar-day-column]")).toHaveCount(1);
  await page.screenshot({
    animations: "disabled",
    path: ".dev/calendar-e2e-results/unified-day-column.png",
  });
});
test("drag previews cross column scroll boundaries and disappear on drop", async ({ page }) => {
  const first = page.getByRole("region", { name: "First calendar" });
  await expect(first.locator('[data-calendar-period-ready="true"]')).toHaveCount(3);
  const card = first.getByRole("button", { name: /Plain meeting/ }).first();
  const box = await card.boundingBox();
  const column = first.locator('[data-calendar-day-column="2026-09-09"]');
  const width = await column.evaluate((element) => element.clientWidth);
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + width, y, { steps: 3 });
  const preview = page.locator("[data-calendar-drag-preview]");
  await expect(preview).toBeVisible();
  expect((await preview.boundingBox()).x).toBeGreaterThan(box.x + width - 2);
  expect(await preview.evaluate((element) => element.parentElement === document.body)).toBe(true);
  await page.mouse.up();
  await expect(preview).toHaveCount(0);
  await expect(first.locator("output")).toContainText("changed:meeting");
  await expect(
    first
      .locator('[data-calendar-day-column="2026-09-10"]')
      .getByRole("button", { name: /Plain meeting/ }),
  ).toBeVisible();
});

for (const view of ["day", "week"])
  for (const area of ["header", "body"]) {
    test(`${view} horizontal wheel over ${area} uses native calendar paging`, async ({ page }) => {
      const first = page.getByRole("region", { name: "First calendar" });
      const second = page.getByRole("region", { name: "Second calendar" });
      await first.getByRole("button", { name: view, exact: true }).click();
      await expect(first.locator('[data-calendar-period-ready="true"]')).toHaveCount(3);
      const pager = first.locator("[data-calendar-period-scroll]");
      const target = first
        .locator(
          `[data-calendar-period="1"] ${area === "header" ? "[data-calendar-date-header]" : "[data-calendar-scroll]"}`,
        )
        .first();
      // Cancellation or an immediate scroll here would bypass native wheel momentum/snapping.
      const native = await target.evaluate((element) => {
        const viewport = element.closest("[data-calendar-period-scroll]");
        const before = viewport.scrollLeft;
        const wheel = new WheelEvent("wheel", {
          deltaX: 80,
          deltaY: 1,
          bubbles: true,
          cancelable: true,
        });
        element.dispatchEvent(wheel);
        return { cancelled: wheel.defaultPrevented, moved: viewport.scrollLeft !== before };
      });
      expect(native).toEqual({ cancelled: false, moved: false });
      await target.hover();
      await page.mouse.wheel(await pager.evaluate((element) => element.clientWidth), 0);
      await expect(first.locator("output")).toContainText(
        view === "day" ? "2026-09-10" : "2026-09-16",
      );
      await expect(second.locator("output")).toContainText("2026-09-09");
      await expect
        .poll(() => pager.evaluate((element) => Math.abs(element.scrollLeft - element.clientWidth)))
        .toBeLessThan(2);
    });
  }

test("density preserves the time anchor and scales creation and drag geometry", async ({
  page,
}) => {
  await page.goto("/scripts/calendar/e2e/surface.html");
  const first = page.getByRole("region", { name: "First calendar", exact: true });
  const body = first.locator('[data-calendar-period="1"] [data-calendar-scroll]').first();
  await body.evaluate((element) => {
    element.scrollTop = 240;
  });
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBe(240);
  await first.getByRole("button", { name: "Toggle density" }).click();
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBe(480);
  const slot = first.getByRole("button", { name: "Create event 2026-09-09 9:00", exact: true });
  await slot.click({ position: { x: 4, y: 26 } });
  await expect(first.locator("output")).toContainText("created:2026-09-09:9.25:30");
  const meeting = first.getByRole("button", { name: /Plain meeting/ });
  await meeting.scrollIntoViewIfNeeded();
  const box = await meeting.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 116, { steps: 5 });
  await page.mouse.up();
  await expect(meeting).toContainText("11:00");
  await first.getByRole("button", { name: "Toggle density" }).click();
  await expect(
    first.locator('[data-calendar-period="1"] [data-calendar-time-content]').first(),
  ).toHaveCSS("height", "1152px");
});
