import { test, expect } from "@playwright/test";

test("repeated clicks on a row grip SVG open actions without selecting the database block", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/scripts/editor/e2e/page-layout.html?workspace=database-views");
  const block = page.locator('[data-type="databaseBlock"]');
  const grip = block.getByRole("button", { name: "Drag child", exact: true });
  for (const clickCount of [2, 3]) {
    await grip.locator("svg").click({ clickCount, force: true });
    await expect(page.locator(".ProseMirror-selectednode")).toHaveCount(0);
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("");
    await page.keyboard.press("Escape");
  }
  expect(errors).toEqual([]);
});

test("embedded database add-view menu opens on the first click and preserves the active view", async ({
  page,
}) => {
  await page.goto("/scripts/editor/e2e/page-layout.html?workspace=database-views");
  const block = page.locator('[data-type="databaseBlock"]');
  const timeline = block.getByRole("tab", { name: "Timeline", exact: true });
  await timeline.click();
  await expect(timeline).toHaveAttribute("aria-selected", "true");
  await expect(block.locator('[data-slot="gantt-announcer"]')).toHaveCount(1);
  const addView = block.getByRole("button", { name: "Add database view", exact: true });
  await addView.click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("button", { name: "Table", exact: true })).toBeVisible();
  await expect(menu.getByRole("button", { name: "Timeline", exact: true })).toBeVisible();
  await expect(timeline).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(addView).toBeFocused();

  await addView.press("Enter");
  await expect(menu).toBeVisible();
  await expect(timeline).toHaveAttribute("aria-selected", "true");
  await page.getByText("After database", { exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(timeline).toHaveAttribute("aria-selected", "true");
});
