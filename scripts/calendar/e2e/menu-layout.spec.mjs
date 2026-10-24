import { test, expect } from "@playwright/test";

for (const { kind, mode, width } of [
  { kind: "dropdown", mode: "nested", width: 1280 },
  { kind: "dropdown", mode: "inline", width: 1280 },
  { kind: "context", mode: "nested", width: 1280 },
  { kind: "drawer", mode: "nested", width: 1280 },
  { kind: "drawer", mode: "inline", width: 1280 },
  { kind: "drawer", mode: "nested", width: 390 },
]) {
  test(`${kind} ${mode} at ${width}px keeps values beside the arrow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/scripts/calendar/e2e/menu-layout.html?kind=${kind}&mode=${mode}`);
    await page
      .getByRole("button", { name: "Open menu" })
      .click({ button: kind === "context" ? "right" : "left" });
    const triggers = page.locator('[data-slot$="sub-trigger"]:visible');
    await expect(triggers).toHaveCount(5);
    await page.evaluate(() =>
      Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {}))),
    );
    for (const name of ["Show", "Properties", "Source", "Legacy value"]) {
      const row = triggers.filter({ hasText: name });
      const value = row.locator('[data-slot="menu-item-trailing"], [data-legacy-value]');
      const arrow = row.locator(":scope > svg");
      const valueBox = await value.boundingBox();
      const arrowBox = await arrow.boundingBox();
      expect(valueBox).not.toBeNull();
      expect(arrowBox.x - (valueBox.x + valueBox.width)).toBeCloseTo(8, 0);
      const rowBox = await row.boundingBox();
      expect(rowBox.x + rowBox.width - (arrowBox.x + arrowBox.width)).toBeCloseTo(8, 0);
    }
    await expect(
      triggers.filter({ hasText: "Properties" }).locator('[data-slot="menu-item-trailing"]'),
    ).toHaveText("0");
    const longValue = triggers
      .filter({ hasText: "Source" })
      .locator('[data-slot="menu-item-trailing"]');
    expect(await longValue.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    await expect(
      triggers.filter({ hasText: "Move to tab" }).locator('[data-slot="menu-item-trailing"]'),
    ).toHaveCount(0);
    const show = triggers.filter({ hasText: "Show" });
    if (kind === "drawer" && width < 768) await show.click();
    else {
      await show.focus();
      await page.keyboard.press("ArrowRight");
    }
    const choice = page.getByText("15 items", { exact: true });
    await expect(choice).toBeVisible();
    await choice.click();
    await expect(page.locator("output")).toHaveText("15");
  });
}
