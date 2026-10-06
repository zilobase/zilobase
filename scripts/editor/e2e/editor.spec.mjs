import { test, expect } from "@playwright/test";
test("StrictMode document replacement keeps editor chrome bound to the live instance", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
  const main = page.getByTestId("main-pane");
  for (let replacement = 0; replacement < 2; replacement++) {
    await page.getByRole("button", { name: "Replace main document" }).click();
    await expect(main.locator(".tiptap-editor")).toContainText("Collaborative replacement");
    await main
      .locator(".tiptap-editor p")
      .first()
      .hover({ position: { x: 5, y: 10 } });
    await expect(main.getByLabel("Open block actions")).toBeVisible();
  }
  await main.locator('[contenteditable="true"]').first().click();
  await page.keyboard.type(" works");
  await expect(main.locator(".tiptap-editor")).toContainText("works");
  expect(errors).toEqual([]);
});
test.beforeEach(async ({ page }) => {
  await page.route("**/api.zilobase.test/**", (route) => route.fulfill({ json: {} }));
  await page.goto("/scripts/editor/e2e/index.html");
});
test("handle aligns on first hover in each positioned pane and follows its scroll", async ({
  page,
}) => {
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
  for (const paneId of ["main-pane", "side-pane"]) {
    const pane = page.getByTestId(paneId);
    const block = pane.locator(".tiptap-editor p").first();
    await block.hover({ position: { x: 25, y: 10 } });
    const handle = pane.locator(".drag-handle");
    await expect(handle).toBeVisible();
    await expect
      .poll(async () => {
        const blockRect = await block.boundingBox();
        const handleRect = await handle.boundingBox();
        const padding = await block.evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
        return Math.abs(handleRect.x + handleRect.width - blockRect.x - padding);
      })
      .toBeLessThan(2);
    await expect
      .poll(async () => {
        const blockRect = await block.boundingBox();
        const handleRect = await handle.boundingBox();
        const inset = await block.evaluate(
          (el) =>
            parseFloat(getComputedStyle(el).paddingTop) +
            (parseFloat(getComputedStyle(el).lineHeight) - 28) / 2,
        );
        return Math.abs(handleRect.y - blockRect.y - inset);
      })
      .toBeLessThan(2);
  }
  const pane = page.getByTestId("side-pane");
  await pane.evaluate((el) => {
    el.style.height = "120px";
  });
  const block = pane.locator(".tiptap-editor p").first();
  await pane.evaluate((el) => {
    el.scrollTop = 20;
  });
  await expect
    .poll(async () => {
      const blockRect = await block.boundingBox();
      const handleRect = await pane.locator(".drag-handle").boundingBox();
      const inset = await block.evaluate(
        (el) =>
          parseFloat(getComputedStyle(el).paddingTop) +
          (parseFloat(getComputedStyle(el).lineHeight) - 28) / 2,
      );
      return Math.abs(handleRect.y - blockRect.y - inset);
    })
    .toBeLessThan(2);
});
test("real local and Yjs editors transfer, compensate, preserve comments, map anchors and pair history", async ({
  page,
}) => {
  await expect.poll(() => page.evaluate(() => typeof window.runScenarios)).toBe("function");
  expect(await page.evaluate(() => window.runScenarios())).toBe("passed");
});
test("replacement editor composition preserves view identity on promotion and isolates typing renders", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
  const main = page.getByTestId("main-pane").locator('[contenteditable="true"]').first();
  await main.click();
  const renders = await page.evaluate(() => window.shellRenders());
  await page.keyboard.type("Hello");
  expect(await page.evaluate(() => window.shellRenders())).toBe(renders);
  const identity = await page.evaluate(() => {
    window.savedSideEditor = window.readyEditors.side;
    return window.readyEditors.side.state.doc.textContent;
  });
  await page.getByRole("button", { name: "Promote side pane" }).click();
  expect(await page.evaluate(() => window.savedSideEditor === window.readyEditors.side)).toBe(true);
  expect(await page.evaluate(() => window.readyEditors.side.state.doc.textContent)).toBe(identity);
  expect(errors).toEqual([]);
});

test("official native drag attaches MIME after serialization and consumes one pane transfer", async ({
  page,
}) => {
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
  await page.evaluate(() => {
    window.nativeDragPayload = null;
    document.addEventListener("dragstart", (event) => {
      window.nativeDragPayload = {
        types: [...event.dataTransfer.types],
        html: event.dataTransfer.getData("text/html"),
        payload: event.dataTransfer.getData("application/x-zilobase-editor-block-drag"),
      };
    });
  });
  const main = page.getByTestId("main-pane"),
    side = page.getByTestId("side-pane");
  await main
    .locator(".tiptap-editor p")
    .first()
    .hover({ position: { x: 5, y: 10 } });
  const grip = main.getByLabel("Open block actions");
  await expect(grip).toBeVisible();
  await grip.dragTo(side.locator(".tiptap-editor p").last());
  const data = await page.evaluate(() => ({
    drag: window.nativeDragPayload,
    main: window.readyEditors.main.state.doc.textContent,
    side: window.readyEditors.side.state.doc.textContent,
  }));
  expect(data.drag.types).toContain("application/x-zilobase-editor-block-drag");
  expect(data.drag.html).toContain("Main one");
  expect(data.main).toBe("Main two");
  expect(data.side.match(/Main one/g)).toHaveLength(1);
  await page.evaluate(() => window.mountedUndo());
  expect(await page.evaluate(() => window.readyEditors.main.state.doc.textContent)).toBe(
    "Main oneMain two",
  );
});

test("official handle preserves a multiple-block selection and copy modifier", async ({ page }) => {
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
  await page.evaluate(() => {
    const editor = window.readyEditors.main;
    editor.commands.setTextSelection({ from: 1, to: editor.state.doc.content.size - 1 });
  });
  const main = page.getByTestId("main-pane"),
    side = page.getByTestId("side-pane");
  await main
    .locator(".tiptap-editor p")
    .first()
    .hover({ position: { x: 5, y: 10 } });
  const modifier = await page.evaluate(() => (/Mac/.test(navigator.platform) ? "Alt" : "Control"));
  await page.keyboard.down(modifier);
  await main.getByLabel("Open block actions").dragTo(side.locator(".tiptap-editor p").last());
  await page.keyboard.up(modifier);
  expect(await page.evaluate(() => window.readyEditors.main.state.doc.textContent)).toBe(
    "Main oneMain two",
  );
  const text = await page.evaluate(() => window.readyEditors.side.state.doc.textContent);
  expect(text.match(/Main one/g)).toHaveLength(1);
  expect(text.match(/Main two/g)).toHaveLength(1);
});

test("rejected and malformed internal drops are consumed without plain-text fallback", async ({
  page,
}) => {
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
  const result = await page.evaluate(() => {
    const editor = window.readyEditors.side,
      before = editor.state.doc.textContent;
    const drop = () => {
      const transfer = new DataTransfer();
      transfer.setData("application/x-zilobase-editor-block-drag", "{}");
      transfer.setData("text/plain", "must never insert");
      const rect = editor.view.dom.getBoundingClientRect();
      const event = new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
        clientX: rect.left + 100,
        clientY: rect.top + 30,
      });
      editor.view.dom.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const editableConsumed = drop();
    editor.setEditable(false, false);
    const readOnlyConsumed = drop();
    return { editableConsumed, readOnlyConsumed, before, after: editor.state.doc.textContent };
  });
  expect(result.editableConsumed).toBe(true);
  expect(result.readOnlyConsumed).toBe(true);
  expect(result.after).toBe(result.before);
});

test("nested list items transfer through the official nested handle", async ({ page }) => {
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
  await page.evaluate(() =>
    window.readyEditors.main.commands.setContent(
      "<ul><li><p>Outer</p><ul><li><p>Nested</p></li></ul></li><li><p>Other</p></li></ul>",
    ),
  );
  const main = page.getByTestId("main-pane"),
    side = page.getByTestId("side-pane");
  await main.locator("li li p").hover({ position: { x: 5, y: 10 } });
  await main.getByLabel("Open block actions").dragTo(side.locator(".tiptap-editor p").last());
  expect(await page.evaluate(() => window.readyEditors.main.state.doc.textContent)).toBe(
    "OuterOther",
  );
  expect(
    (await page.evaluate(() => window.readyEditors.side.state.doc.textContent)).match(/Nested/g),
  ).toHaveLength(1);
});

test("database header exposes an aligned handle and drags the whole block", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
  await page.evaluate(() =>
    window.readyEditors.main.commands.setContent({
      type: "doc",
      content: [
        { type: "databaseBlock", attrs: { databaseId: null, showTitle: true } },
        { type: "paragraph" },
      ],
    }),
  );
  const main = page.getByTestId("main-pane");
  const title = main.getByRole("textbox", { name: "Database title", exact: true });
  await title.hover();
  const handle = main.locator(".drag-handle");
  await expect(handle).toBeVisible();
  await expect
    .poll(async () => {
      const headerRect = await main.locator(".database-toolbar > div").first().boundingBox();
      const handleRect = await handle.boundingBox();
      return Math.abs(handleRect.y + handleRect.height / 2 - headerRect.y - headerRect.height / 2);
    })
    .toBeLessThan(2);
  await main.getByLabel("Open block actions").click();
  await expect(page.getByText("Turn into", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await title.hover();
  await main
    .getByLabel("Open block actions")
    .dragTo(page.getByTestId("side-pane").locator(".tiptap-editor p").last());
  expect(
    await page.evaluate(
      () =>
        window.readyEditors.main.getJSON().content.filter((node) => node.type === "databaseBlock")
          .length,
    ),
  ).toBe(0);
  expect(
    await page.evaluate(
      () =>
        window.readyEditors.side.getJSON().content.filter((node) => node.type === "databaseBlock")
          .length,
    ),
  ).toBe(1);
  expect(errors).toEqual([]);
});

test("dialog transfers share chronological history and pane padding consumes internal drops", async ({
  page,
}) => {
  await expect.poll(() => page.evaluate(() => window.editorReady())).toBe(true);
  await page.getByRole("button", { name: "Toggle dialog" }).click();
  await expect
    .poll(() => page.evaluate(() => Boolean(window.readyEditors.dialog?.isInitialized)))
    .toBe(true);
  const main = page.getByTestId("main-pane"),
    dialog = page.getByTestId("dialog-pane");
  await main
    .locator(".tiptap-editor p")
    .first()
    .hover({ position: { x: 5, y: 10 } });
  await main.getByLabel("Open block actions").dragTo(dialog.locator(".tiptap-editor p").last());
  expect(await page.evaluate(() => window.readyEditors.main.state.doc.textContent)).toBe(
    "Main two",
  );
  expect(
    (await page.evaluate(() => window.readyEditors.dialog.state.doc.textContent)).match(
      /Main one/g,
    ),
  ).toHaveLength(1);
  await dialog.locator(".tiptap-editor").click();
  await page.keyboard.press("Meta+z");
  expect(await page.evaluate(() => window.readyEditors.main.state.doc.textContent)).toBe(
    "Main oneMain two",
  );
  await page.getByRole("button", { name: "Toggle dialog" }).click();
  await expect.poll(() => page.evaluate(() => window.readyEditors.dialog)).toBe(undefined);
});
