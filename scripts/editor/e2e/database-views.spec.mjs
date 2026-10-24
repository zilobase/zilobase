import { test, expect } from "@playwright/test";

test("marquee selection stays a hidden native range when an outside control takes focus", async ({
  page,
}) => {
  await page.goto("/scripts/editor/e2e/page-layout.html?workspace=database-views");
  const editor = page.locator(".tiptap-editor");
  await page.locator(".database-table").first().waitFor();
  const before = await page.getByText("Before database", { exact: true }).boundingBox();
  const after = await page.getByText("After database", { exact: true }).boundingBox();
  await page.mouse.move(before.x - 20, before.y + 5);
  await page.mouse.down();
  await page.mouse.move(after.x + 40, after.y + 10, { steps: 8 });
  await page.mouse.up();
  await expect(editor.locator(".editor-block-selection")).toHaveCount(3);
  await expect(editor).toHaveClass(/ProseMirror-hideselection/);

  // A button retains the browser range on blur. An input or a blank div would
  // collapse it by default and miss the stale-range exposure.
  await page.evaluate(() => {
    const button = document.createElement("button");
    button.textContent = "Outside selection control";
    button.style.cssText = "position:fixed;left:10px;bottom:10px";
    document.body.append(button);
  });
  const outside = page.getByRole("button", { name: "Outside selection control" });
  await outside.click();
  await expect(outside).toBeFocused();
  await expect(editor).toHaveClass(/ProseMirror-hideselection/);
  expect(
    await editor.evaluate((node) => ({
      type: node.editor.state.selection.toJSON().type,
      visible: node.editor.state.selection.visible,
      native: window.getSelection()?.toString(),
    })),
  ).toMatchObject({ type: "blockRange", visible: false, native: expect.stringContaining("Rows") });

  await page.getByText("After database", { exact: true }).click();
  await expect(editor.locator(".editor-block-selection")).toHaveCount(0);
  await expect(editor).not.toHaveClass(/ProseMirror-hideselection/);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("");
});

test("database node selection keeps ProseMirror's hidden native range across unrelated updates", async ({
  page,
}) => {
  await page.goto("/scripts/editor/e2e/page-layout.html?workspace=database-views");
  const editor = page.locator(".tiptap-editor");
  await page.locator(".database-table").first().waitFor();
  await editor.evaluate((node) => {
    const editor = node.editor;
    let databasePos;
    editor.state.doc.descendants((child, pos) => {
      if (child.type.name === "databaseBlock") databasePos = pos;
    });
    editor.view.focus();
    editor.commands.setNodeSelection(databasePos);
  });
  await expect(editor.locator(".ProseMirror-selectednode")).toHaveCount(1);
  await expect(editor).toHaveClass(/ProseMirror-hideselection/);
  await editor.evaluate((node) => {
    node.editor.view.dispatch(node.editor.state.tr.setMeta("addToHistory", false));
  });
  await expect(editor).toHaveClass(/ProseMirror-hideselection/);
  await expect(editor.locator(".editor-block-selection")).toHaveCount(0);
  expect(
    await editor.evaluate((node) => ({
      type: node.editor.state.selection.toJSON().type,
      visible: node.editor.state.selection.visible,
    })),
  ).toEqual({ type: "node", visible: false });
});

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
