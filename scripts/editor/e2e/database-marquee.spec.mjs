import { test, expect } from "@playwright/test";

const main = (page) => page.getByTestId("main");
const editor = (page) => main(page).locator(".tiptap-editor");
const database = (page) => main(page).locator('[data-type="databaseBlock"]').first();
const rows = (page) => main(page).locator('[data-row-selected="true"]');
const blocks = (page) => main(page).locator(".editor-block-selection");

async function begin(page, { reverse = false, right = false } = {}) {
  const db = database(page);
  const surface = await db.locator("[data-database-marquee-surface]").boundingBox();
  const first = await db.locator("[data-database-row-id]").first().boundingBox();
  const last = await db.locator("[data-database-row-id]").last().boundingBox();
  const x = right ? surface.x + surface.width + 30 : surface.x - 30;
  const inside = right ? first.x + first.width - 20 : first.x + 100;
  await page.mouse.move(x, reverse ? last.y + last.height - 2 : first.y + 2);
  await page.mouse.down();
  await page.mouse.move(inside, reverse ? first.y + 2 : last.y + last.height - 2, { steps: 8 });
  await expect(rows(page)).toHaveCount(3);
  await expect(blocks(page)).toHaveCount(0);
  await expect(db.getByRole("button", { name: "3 selected" })).toBeVisible();
  return { first, last, inside, x };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/scripts/editor/e2e/database-marquee.html");
  await expect(main(page).locator("[data-database-marquee-surface]")).toHaveCount(2);
});

test("a page block marquee clears row checkboxes in its editor and preserves another pane", async ({
  page,
}) => {
  const first = database(page);
  const second = main(page).locator('[data-type="databaseBlock"]').nth(1);
  const side = page.getByTestId("side").locator('[data-type="databaseBlock"]').first();
  await first.getByRole("checkbox", { name: "Select one" }).check();
  await second.getByRole("checkbox", { name: "Select two" }).check();
  await side.getByRole("checkbox", { name: "Select three" }).check();

  const before = await editor(page).locator("p").first().boundingBox();
  const heading = await editor(page).locator("h2").boundingBox();
  await page.mouse.move(before.x - 20, before.y + 5);
  await page.mouse.down();
  await page.mouse.move(heading.x + 40, heading.y + 10, { steps: 8 });
  await expect(blocks(page)).toHaveCount(3);
  await expect(rows(page)).toHaveCount(0);
  await expect(main(page).getByRole("button", { name: /selected/ })).toHaveCount(0);
  await expect(side.getByRole("checkbox", { name: "Select three" })).toBeChecked();
  await page.mouse.up();
  await expect(rows(page)).toHaveCount(0);

  await first.getByRole("checkbox", { name: "Select one" }).check();
  await expect(blocks(page)).toHaveCount(0);
  await expect(rows(page)).toHaveCount(1);
});

for (const reverse of [false, true]) {
  for (const right of [false, true]) {
    test(`database rows become whole blocks dragging ${reverse ? "up" : "down"} from ${right ? "right" : "left"}`, async ({
      page,
    }) => {
      const { inside } = await begin(page, { reverse, right });
      const neighbor = reverse ? editor(page).locator("p").first() : editor(page).locator("h2");
      const rect = await neighbor.boundingBox();
      await page.mouse.move(inside, rect.y + rect.height / 2, { steps: 8 });
      await expect(rows(page)).toHaveCount(0);
      await expect(blocks(page)).toHaveCount(2);
      await expect(editor(page).locator(".node-databaseBlock").first()).toHaveClass(
        /editor-block-selection/,
      );
      await expect(neighbor).toHaveClass(/editor-block-selection/);
      await expect(database(page).getByRole("button", { name: /selected/ })).toHaveCount(0);
      await expect(editor(page)).toBeFocused();
      await expect(page.getByTestId("side").locator(".editor-block-selection")).toHaveCount(0);
      await expect(page.locator(".database-record-marquee")).toHaveCount(1);
      await page.mouse.up();
      await expect(page.locator(".database-record-marquee")).toHaveCount(0);
      await expect(blocks(page)).toHaveCount(2);
      expect(await page.evaluate(() => window.main.state.selection.toJSON().type)).toBe(
        "blockRange",
      );
      await page.keyboard.press("Escape");
      await expect(blocks(page)).toHaveCount(0);
    });
  }
}

test("retracting into the database restores row mode and can extend through another database", async ({
  page,
}) => {
  const { inside, first, last } = await begin(page);
  const heading = await editor(page).locator("h2").boundingBox();
  await page.mouse.move(inside, heading.y + 10, { steps: 6 });
  await expect(blocks(page)).toHaveCount(2);
  await page.mouse.move(inside, last.y + last.height - 2, { steps: 6 });
  await expect(blocks(page)).toHaveCount(0);
  await expect(rows(page)).toHaveCount(3);
  await expect(database(page).getByRole("grid")).toBeFocused();
  const second = await main(page).locator('[data-type="databaseBlock"]').nth(1).boundingBox();
  await page.mouse.move(inside, second.y + 50, { steps: 8 });
  await expect(blocks(page)).toHaveCount(4);
  await expect(rows(page)).toHaveCount(0);
  await page.mouse.move(first.x - 20, first.y + 4, { steps: 6 });
  await expect(blocks(page)).toHaveCount(0);
  await expect(rows(page)).toHaveCount(0);
  await page.mouse.up();
});

for (const cancellation of ["Escape", "blur", "pointercancel"]) {
  test(`${cancellation} restores the selections from before promotion`, async ({ page }) => {
    await database(page).getByRole("checkbox", { name: "Select three" }).check();
    await page.evaluate(() => window.main.commands.setTextSelection({ from: 2, to: 5 }));
    const { inside } = await begin(page);
    const heading = await editor(page).locator("h2").boundingBox();
    await page.mouse.move(inside, heading.y + 10, { steps: 6 });
    await expect(blocks(page)).toHaveCount(2);
    if (cancellation === "Escape") await page.keyboard.press("Escape");
    else
      await page.evaluate((type) => {
        if (type === "blur") window.dispatchEvent(new Event(type));
        else document.dispatchEvent(new PointerEvent(type, { pointerId: 1 }));
      }, cancellation);
    await expect(page.locator(".database-record-marquee")).toHaveCount(0);
    await expect(blocks(page)).toHaveCount(0);
    await expect(rows(page)).toHaveCount(1);
    await expect(database(page).getByRole("checkbox", { name: "Select three" })).toBeChecked();
    expect(await page.evaluate(() => window.main.state.selection.toJSON())).toEqual({
      type: "text",
      anchor: 2,
      head: 5,
    });
    await page.mouse.up();
  });
}

for (const interruption of ["edit", "readonly", "destroy"]) {
  test(`${interruption} stops the database gesture after promotion`, async ({ page }) => {
    const { inside } = await begin(page);
    const heading = await editor(page).locator("h2").boundingBox();
    await page.mouse.move(inside, heading.y + 10, { steps: 6 });
    await expect(blocks(page)).toHaveCount(2);
    await page.evaluate((interruption) => {
      if (interruption === "edit") window.main.commands.insertContentAt(1, "Remote ");
      else if (interruption === "readonly") window.main.setEditable(false);
      else window.main.destroy();
    }, interruption);
    await expect(page.locator(".database-record-marquee")).toHaveCount(0);
    await expect(page.locator(".editor-marquee-selecting")).toHaveCount(0);
    await page.mouse.up();
  });
}

test("the release position promotes selection before the next animation frame", async ({
  page,
}) => {
  const { inside } = await begin(page);
  const heading = await editor(page).locator("h2").boundingBox();
  await page.evaluate(
    ({ x, y }) => {
      document.dispatchEvent(
        new PointerEvent("pointerup", { pointerId: 1, clientX: x, clientY: y }),
      );
    },
    { x: inside, y: heading.y + 10 },
  );
  await expect(blocks(page)).toHaveCount(2);
  await expect(rows(page)).toHaveCount(0);
  await expect(page.locator(".database-record-marquee")).toHaveCount(0);
  await page.mouse.up();
});

test("edge scrolling extends the promoted block range and stops on release", async ({ page }) => {
  await page.evaluate(() =>
    window.main.commands.insertContentAt(
      window.main.state.doc.content.size,
      Array.from({ length: 35 }, (_, index) => `<p>Extra block ${index}</p>`).join(""),
    ),
  );
  const { inside } = await begin(page);
  const pane = main(page);
  const rect = await pane.boundingBox();
  await page.mouse.move(inside, rect.y + rect.height - 10, { steps: 8 });
  await expect.poll(() => pane.evaluate((node) => node.scrollTop)).toBeGreaterThan(100);
  await expect.poll(() => blocks(page).count()).toBeGreaterThan(10);
  await expect(rows(page)).toHaveCount(0);
  await page.mouse.up();
  await expect(page.locator(".database-record-marquee")).toHaveCount(0);
  const scroll = await pane.evaluate((node) => node.scrollTop);
  await page.waitForTimeout(100);
  expect(await pane.evaluate((node) => node.scrollTop)).toBe(scroll);
});
