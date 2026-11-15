import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/scripts/editor/e2e/page-layout.html?comments=1");
  await expect(page.locator(".editor-comment-anchor")).toBeVisible();
});

test("floating comments reserve space, navigate anchors, reply, resolve and undo", async ({
  page,
}) => {
  const content = page.locator(".editor-comments-document");
  const before = await content.boundingBox();
  await page.getByRole("button", { name: "Open comments", exact: true }).click();
  const card = page.getByRole("region", { name: "Comments", exact: true });
  await expect(card).toBeVisible();
  await expect
    .poll(async () => (await content.boundingBox()).width)
    .toBeLessThan(before.width - 300);
  const mainBox = await content.boundingBox();
  const cardBox = await card.boundingBox();
  expect(cardBox.x).toBeGreaterThan(mainBox.x + mainBox.width);
  const toc = page.getByRole("button", { name: "Table of contents", exact: true });
  const tocBox = await toc.boundingBox();
  expect(cardBox.x + cardBox.width).toBeLessThan(tocBox.x - 16);
  await toc.hover();
  await expect(page.getByRole("navigation", { name: "Page headings" })).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page.getByRole("navigation", { name: "Page headings" })).not.toBeVisible();
  await expect(card.getByRole("tab")).toHaveCount(0);
  await expect(card.getByText("1 reply", { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("floating-comments.png") });

  await card.getByRole("button", { name: /Maya Chen.*Shared drafts/ }).click();
  const reply = card.getByPlaceholder("Reply...");
  await reply.fill("The updated wording looks good.");
  await expect(reply).toBeFocused();
  await reply.press("Enter");
  await expect(card.getByText("The updated wording looks good.", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Resolve comment from Maya Chen", exact: true }).click();
  await expect(card.getByText("No open comments.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(card.getByText("The updated wording looks good.", { exact: true })).toBeVisible();

  await card.getByRole("button", { name: "Close comments", exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect.poll(async () => (await content.boundingBox()).width).toBe(before.width);
  await page.locator(".editor-comment-anchor").click();
  await expect(card).toBeVisible();
  await expect(card.getByPlaceholder("Reply...")).toBeVisible();
});

test("comment actions stay visible while the More menu has focus", async ({ page }) => {
  await page.getByRole("button", { name: "Open comments", exact: true }).click();
  const card = page.locator(".floating-comments");
  await card.getByRole("button", { name: /Maya Chen.*Shared drafts/ }).click();
  const comment = card.locator("article").first();
  const actions = comment.locator('[aria-label="Comment actions"]');

  await comment.hover();
  await actions.getByRole("button", { name: "More comment actions" }).click();
  await page.getByRole("menuitem", { name: "Edit", exact: true }).focus();
  await page.mouse.move(0, 0);
  await expect(actions).toHaveCSS("opacity", "1");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await card.getByPlaceholder("Reply...", { exact: true }).focus();
  await page.mouse.move(0, 0);
  await expect(actions).toHaveCSS("opacity", "0");
});

test("reconnecting keeps the comment input, draft and active thread mounted", async ({ page }) => {
  await page.getByRole("button", { name: "Open comments", exact: true }).click();
  const card = page.locator(".floating-comments");
  await card.getByRole("button", { name: /Maya Chen.*Shared drafts/ }).click();
  const reply = card.getByPlaceholder("Reply...", { exact: true });
  await reply.fill("Keep this draft through reconnect.");
  await reply.evaluate((input) => {
    window.savedCommentInput = input;
  });

  await page.evaluate(() => window.commentControllers.get("main").setConnectionReady(false));
  await expect(reply).toBeVisible();
  await expect(reply).toBeDisabled();
  await expect(reply).toHaveValue("Keep this draft through reconnect.");
  await expect(
    card.getByRole("list", { name: "Open comments" }).getByRole("button", { name: "Send reply" }),
  ).toBeDisabled();
  await expect(card.getByText("I will update the draft today.", { exact: true })).toBeVisible();

  await page.evaluate(() => window.commentControllers.get("main").setConnectionReady(true));
  await expect(reply).toBeEnabled();
  expect(await reply.evaluate((input) => input === window.savedCommentInput)).toBe(true);
  await expect(reply).toHaveValue("Keep this draft through reconnect.");
  await reply.press("Enter");
  await expect(card.getByText("Keep this draft through reconnect.", { exact: true })).toBeVisible();
  await expect(reply).toHaveValue("");
});

test("page discussion input stays visible with its draft while reconnecting", async ({ page }) => {
  await page.goto("/scripts/editor/e2e/page-layout.html?comments=1&inline-comments=1");
  const input = page.getByPlaceholder("Add a comment...", { exact: true });
  await expect(input).toBeVisible();
  await input.fill("A draft below the page title.");
  await input.evaluate((element) => {
    window.savedPageCommentInput = element;
  });
  await page.evaluate(() => window.commentControllers.get("main").setConnectionReady(false));
  await expect(input).toBeVisible();
  await expect(input).toBeDisabled();
  await expect(page.getByText("I will update the draft today.", { exact: true })).toBeVisible();
  await page.evaluate(() => window.commentControllers.get("main").setConnectionReady(true));
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue("A draft below the page title.");
  expect(await input.evaluate((element) => element === window.savedPageCommentInput)).toBe(true);
  await input.press("Enter");
  await expect(page.getByText("A draft below the page title.", { exact: true })).toBeVisible();
});

test("submitting page metadata comments keeps the overlay closed", async ({ page }) => {
  await page.goto("/scripts/editor/e2e/page-layout.html?comments=1&inline-comments=1");
  const metadata = page.locator("[data-page-metadata-content]");
  const input = metadata.getByPlaceholder("Add a comment...", { exact: true });
  await expect(input).toBeEnabled();
  await page.evaluate(() => {
    const controller = window.commentControllers.get("main");
    for (const thread of controller.getSnapshot().threads) {
      controller.resolveThread(thread.id);
    }
  });
  await expect(
    metadata.getByText("Can we make this clearer before launch?", { exact: true }),
  ).toHaveCount(0);
  const card = page.getByRole("region", { name: "Comments", exact: true });
  await expect(card).toHaveCount(0);

  await metadata.hover();
  await metadata.getByRole("button", { name: "Add comment", exact: true }).click();
  await input.fill("A new comment from page metadata.");
  await metadata.getByRole("button", { name: "Send reply", exact: true }).click();
  await expect(
    metadata.getByText("A new comment from page metadata.", { exact: true }),
  ).toBeVisible();
  await expect(card).toHaveCount(0);
  await expect(input).toHaveValue("");

  await input.fill("A reply from page metadata.");
  await input.press("Enter");
  await expect(metadata.getByText("A reply from page metadata.", { exact: true })).toBeVisible();
  await expect(card).toHaveCount(0);

  await page.getByRole("button", { name: "Open comments", exact: true }).click();
  await expect(card).toBeVisible();
  await expect(card.getByText("A new comment from page metadata.", { exact: true })).toBeVisible();
  await expect(card.getByText("A reply from page metadata.", { exact: true })).toBeVisible();
});

test("selection comments keep their anchor while the document changes", async ({ page }) => {
  await page.evaluate(() => {
    const editor = window.commentEditors.get("main");
    editor.chain().focus().setTextSelection({ from: 22, to: 35 }).run();
  });
  await page.getByRole("button", { name: "Comment on selection", exact: true }).click();
  const input = page.getByPlaceholder("Add a comment...", { exact: true });
  await input.fill("Clarify this selection.");
  await page.evaluate(() => {
    const editor = window.commentEditors.get("main");
    editor.view.dispatch(editor.state.tr.insertText("New: ", 1));
  });
  await input.press("Enter");
  await expect(page.getByRole("region", { name: "Comments", exact: true })).toBeVisible();
  const thread = await page.evaluate(() =>
    window.commentControllers
      .get("main")
      .getSnapshot()
      .threads.find((t) => t.kind === "inline"),
  );
  expect(thread.quote).toBe("agents write ".trim());
  expect(thread.anchorAttached).toBe(true);
  await expect(page.locator(`[data-comment-id="${thread.id}"]`)).toHaveText(" agents write");
});

test("narrow pages keep comments in the same content flow", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  const content = page.locator(".editor-comments-document");
  const before = await content.boundingBox();
  const viewport = page.locator("[data-page-scroll-viewport]");
  const viewportBefore = await viewport.boundingBox();
  await page.getByRole("button", { name: "Open comments", exact: true }).click();
  const card = page.getByRole("region", { name: "Comments", exact: true });
  await expect(card).toBeVisible();
  const after = await content.boundingBox();
  const cardBox = await card.boundingBox();
  expect(after.width).toBe(before.width);
  expect(after.y).toBeGreaterThanOrEqual(cardBox.y + cardBox.height);
  expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(600);
  expect(await viewport.boundingBox()).toEqual(viewportBefore);
  await card.getByRole("button", { name: "Close comments", exact: true }).click();
  await expect.poll(async () => (await content.boundingBox()).y).toBe(before.y);
});

test("only the cover stays full width while metadata and document make room for comments", async ({
  page,
}) => {
  await page.goto("/scripts/editor/e2e/page-layout.html?comments=1&cover=1");
  const cover = page.getByRole("img", { name: "Cover", exact: true });
  const metadata = page.locator("[data-page-metadata-content]");
  const viewport = page.locator("[data-page-scroll-viewport]");
  const editor = page.locator(".editor-comments-document");
  await expect(cover).toBeVisible();
  await expect(page.getByRole("button", { name: "Open comments", exact: true })).toBeVisible();
  const coverBefore = await cover.boundingBox();
  const metadataBefore = await metadata.boundingBox();
  const viewportBefore = await viewport.boundingBox();
  const editorBefore = await editor.boundingBox();
  await page.getByRole("button", { name: "Open comments", exact: true }).click();
  const card = page.getByRole("region", { name: "Comments", exact: true });
  await expect(card).toBeVisible();
  await expect
    .poll(async () => (await editor.boundingBox()).width)
    .toBeLessThan(editorBefore.width - 300);
  expect(await cover.boundingBox()).toEqual(coverBefore);
  const metadataAfter = await metadata.boundingBox();
  expect(metadataAfter.width).toBeLessThan(metadataBefore.width - 300);
  expect(metadataAfter.width).toBe((await editor.boundingBox()).width);
  expect(metadataAfter.x).toBe((await editor.boundingBox()).x);
  expect(await viewport.boundingBox()).toEqual(viewportBefore);
  const cardBox = await card.boundingBox();
  expect(cardBox.y).toBeGreaterThanOrEqual(coverBefore.y + coverBefore.height);
  expect(cardBox.y).toBeLessThan(metadataAfter.y + metadataAfter.height);
  expect(
    await card.evaluate((el) =>
      Boolean(el.closest("[data-editor-surface]") && el.closest("[data-page-scroll-viewport]")),
    ),
  ).toBe(true);
  await page.screenshot({ path: test.info().outputPath("comments-below-cover.png") });
  await viewport.evaluate((el) => {
    el.scrollTop = 120;
  });
  await expect.poll(async () => (await card.boundingBox()).y).toBeLessThan(cardBox.y - 100);
});

test("opening comments uses the same content width in narrow and full-width modes", async ({
  page,
}) => {
  const geometry = async (narrow) => {
    await page.goto(
      `/scripts/editor/e2e/page-layout.html?comments=1&cover=1${narrow ? "&narrow=1" : ""}`,
    );
    await page.getByRole("button", { name: "Open comments", exact: true }).click();
    const body = page.locator("[data-editor-page-content]");
    await expect(page.locator(".floating-comments")).toBeVisible();
    await page
      .locator(".editor-comments-body")
      .evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
    expect((await body.boundingBox()).width).toBeGreaterThan(950);
    return {
      body: await body.boundingBox(),
      metadata: await page.locator("[data-page-metadata-content]").boundingBox(),
      cover: await page.getByRole("img", { name: "Cover", exact: true }).boundingBox(),
    };
  };
  const narrow = await geometry(true);
  const full = await geometry(false);
  expect(narrow).toEqual(full);
});

test("comment requests stay in their page pane and do not remount the editor", async ({ page }) => {
  await page.getByRole("button", { name: "Direct pane", exact: true }).click();
  const pane = page.locator('[data-page-layout="pane"]');
  await expect(pane.locator(".editor-comment-anchor")).toBeVisible();
  await page.evaluate(() => {
    window.savedCommentEditor = window.commentEditors.get("child");
  });
  await pane.getByRole("button", { name: "Show comments", exact: true }).click();
  await expect(pane.getByRole("region", { name: "Comments", exact: true })).toBeVisible();
  await expect(page.locator('[data-page-layout="main"] .floating-comments')).toHaveCount(0);
  await pane.getByRole("button", { name: "Close comments", exact: true }).last().click();
  expect(
    await page.evaluate(() => window.savedCommentEditor === window.commentEditors.get("child")),
  ).toBe(true);
});

test("block comment button stays mounted while the pointer moves onto it", async ({ page }) => {
  const block = page.getByLabel("Document editor").locator(":scope > p").nth(1);
  const blockBox = await block.boundingBox();
  await page.mouse.move(blockBox.x + 8, blockBox.y + blockBox.height / 2);
  const button = page.locator(".block-comment-button");
  await expect(button).toBeVisible();

  const buttonBox = await button.boundingBox();
  await page.mouse.move(buttonBox.x + buttonBox.width / 2, buttonBox.y + buttonBox.height / 2, {
    steps: 12,
  });
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByPlaceholder("Add a comment...", { exact: true })).toBeVisible();
});
