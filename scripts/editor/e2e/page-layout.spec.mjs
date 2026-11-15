import { test, expect } from "@playwright/test";

const fixture = "/scripts/editor/e2e/page-layout.html";

async function settlePresentation(locator) {
  await locator.evaluate(async (node) => {
    node.getBoundingClientRect();
    await Promise.allSettled(
      node.getAnimations({ subtree: true }).map((animation) => animation.finished),
    );
  });
}

test("expanding a pane opens its page in the main route and removes the pane", async ({ page }) => {
  await page.goto(fixture);
  await page.getByRole("button", { name: "Direct pane", exact: true }).click();
  const side = page.locator("[data-page-side-pane-panel] [data-page-layout]");
  await expect(side).toHaveAttribute("data-page-layout", "pane");
  for (const frame of await page.locator("[data-page-layout]").all()) {
    await expect(frame.locator("[data-page-header]")).toHaveCount(1);
    await expect(frame.locator("[data-page-scroll-viewport]")).toHaveCount(1);
  }
  const viewport = side.locator("[data-page-scroll-viewport]");
  const top = await side
    .locator("[data-page-header]")
    .evaluate((node) => node.getBoundingClientRect().top);
  await viewport.evaluate((node) => {
    node.scrollTop = 150;
  });
  await expect
    .poll(() =>
      side.locator("[data-page-header]").evaluate((node) => node.getBoundingClientRect().top),
    )
    .toBe(top);
  await side.getByRole("link", { name: "Open as full page", exact: true }).click();
  await expect(page.locator("[data-fixture-path]")).toHaveText("/p/child");
  const main = page.locator('[data-page-side-pane-main] [data-page-layout="main"]');
  await expect(main.getByLabel("Draft child")).toHaveCount(1);
  await expect(page.locator("[data-page-side-pane-panel]")).toHaveCount(0);

  // The new main page can open another independent pane.
  await page.evaluate(() => window.pageLayoutCommands.openSidePane("other"));
  await expect(main.getByLabel("Draft child")).toHaveCount(1);
  await expect(page.locator("[data-page-side-pane-panel]").getByLabel("Draft other")).toHaveCount(
    1,
  );
});

test("desktop dialog contains its page header and closes with focus restoration", async ({
  page,
}) => {
  await page.goto(fixture);
  const trigger = page.getByRole("button", { name: "Direct dialog", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator('[data-page-layout="dialog"]')).toHaveCount(1);
  await expect(dialog.locator("[data-page-header]")).toHaveCount(1);
  await expect(dialog.locator("[data-page-scroll-viewport]")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

for (const command of ["Direct pane", "Direct dialog", "Open child"]) {
  test(`mobile ${command} opens main without an embedded host`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(fixture);
    await page.getByRole("button", { name: command, exact: true }).click();
    await expect(page.locator("[data-fixture-path]")).toHaveText("/p/child");
    await expect(page.locator("[data-page-side-pane-panel], [data-page-dialog-panel]")).toHaveCount(
      0,
    );
    await expect(page.locator('[data-page-layout="main"]')).toHaveCount(1);
    await page.getByRole("button", { name: "Open current", exact: true }).click();
    await expect(page.locator("[data-fixture-path]")).toHaveText("/p/child");
  });
}

test("mobile deep links and a desktop dialog resized to mobile replace the main route", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${fixture}?target=${encodeURIComponent("/p/main?p=child")}`);
  await expect(page.locator("[data-fixture-path]")).toHaveText("/p/child");
  await expect(page.locator("[data-page-side-pane-panel], [data-page-dialog-panel]")).toHaveCount(
    0,
  );
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(fixture);
  await page.getByRole("button", { name: "Direct dialog", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("[data-fixture-path]")).toHaveText("/p/child");
  await expect(page.locator("[data-page-side-pane-panel], [data-page-dialog-panel]")).toHaveCount(
    0,
  );
  await page.setViewportSize({ width: 1400, height: 900 });
  await expect(page.locator("[data-page-side-pane-panel], [data-page-dialog-panel]")).toHaveCount(
    0,
  );
});

test("mobile ignores a saved dialog preference without overwriting it", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(fixture);
  await page.getByRole("button", { name: "Prefer dialog", exact: true }).click();
  await page.getByRole("button", { name: "Open child", exact: true }).click();
  await expect(page.locator("[data-fixture-path]")).toHaveText("/p/child");
  await expect(page.locator("[data-page-side-pane-panel], [data-page-dialog-panel]")).toHaveCount(
    0,
  );
  expect(await page.evaluate(() => window.pageLayoutFixture.settings().embeddedItemsOpenAs)).toBe(
    "dialog",
  );
  expect(await page.evaluate(() => window.pageLayoutFixture.writes)).toEqual([]);
});

test("desktop preference opens a dialog and clicking the same target toggles it closed", async ({
  page,
}) => {
  await page.goto(fixture);
  await page.getByRole("button", { name: "Prefer dialog", exact: true }).click();
  await page.getByRole("button", { name: "Open child", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.evaluate(() => window.pageLayoutOpen("child"));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("[data-fixture-path]")).toHaveText("/p/main");
});

test("dialog-to-pane presentation switching keeps the page target", async ({ page }) => {
  await page.goto(fixture);
  await page.getByRole("button", { name: "Direct dialog", exact: true }).click();
  await settlePresentation(page.getByRole("dialog"));
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Open pages as", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Side panel", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator('[data-page-side-pane-panel] [data-page-layout="pane"]')).toHaveCount(
    1,
  );
  await expect(page.getByLabel("Draft child")).toHaveCount(1);
});

test("row navigation uses database context and preserves that context for the next row", async ({
  page,
}) => {
  await page.goto(fixture);
  await page.getByRole("button", { name: "Open row", exact: true }).click();
  const side = page.locator("[data-page-side-pane-panel]");
  await expect(side.getByRole("button", { name: "Open previous row", exact: true })).toBeDisabled();
  await expect(side.getByRole("button", { name: "Open next row", exact: true })).toBeEnabled();
  await side.getByRole("button", { name: "Open next row", exact: true }).click();
  await expect(side.getByLabel("Draft other")).toHaveCount(1);
  await expect(page.locator("[data-fixture-path]")).toContainText("d=database");
  await expect(side.getByRole("button", { name: "Open previous row", exact: true })).toBeEnabled();
});

test("navigation commands execute synchronously and preserve thrown adapter errors", async ({
  page,
}) => {
  await page.goto(fixture);
  await expect(page.getByLabel("Draft main")).toHaveCount(1);
  const result = await page.evaluate(() => {
    const history = window.pageLayoutFixture.router.history;
    const push = history.push;
    const failure = new Error("history failed");
    const order = [];
    history.push = () => {
      order.push("push");
      throw failure;
    };
    let originalError = false;
    try {
      order.push("before");
      window.pageLayoutCommands.openSidePane("child");
      order.push("after");
    } catch (error) {
      originalError = error === failure;
    } finally {
      history.push = push;
    }
    return { order, originalError };
  });
  expect(result).toEqual({ order: ["before", "push"], originalError: true });
});

for (const audience of ["public", "guest"]) {
  test(`${audience} page uses the common frame with its own available actions`, async ({
    page,
  }) => {
    await page.goto(`${fixture}?audience=${audience}`);
    const frame = page.locator('[data-page-layout="main"]');
    await expect(frame.locator("[data-page-header]")).toHaveCount(1);
    await expect(frame.locator("[data-page-scroll-viewport]")).toHaveCount(1);
    await expect(frame.getByRole("button", { name: "Toggle Sidebar", exact: true })).toHaveCount(0);
    await expect(frame.getByRole("button", { name: "Share", exact: true })).toHaveCount(0);
    if (audience === "public")
      await expect(frame.getByRole("link", { name: "Login", exact: true })).toHaveCount(1);
    else {
      await expect(frame.getByText("Guest", { exact: true })).toHaveCount(1);
      await expect(frame.getByRole("button", { name: "Copy link", exact: true })).toHaveCount(1);
    }
  });
}

for (const state of ["loading", "error"]) {
  test(`header remains present while page body is ${state}`, async ({ page }) => {
    await page.goto(`${fixture}?body=${state}`);
    const frame = page.locator('[data-page-layout="main"]');
    await expect(frame.locator("[data-page-header]")).toHaveCount(1);
    await expect(
      frame.getByText(state === "loading" ? "Loading page..." : "Page unavailable.", {
        exact: true,
      }),
    ).toHaveCount(1);
  });
}

test("desktop pane URL participates in back/forward navigation", async ({ page }) => {
  await page.goto(fixture);
  await page.getByRole("button", { name: "Direct pane", exact: true }).click();
  await expect(page.locator("[data-page-side-pane-panel]")).toHaveAttribute("aria-hidden", "false");
  await page.evaluate(() => window.pageLayoutFixture.router.history.back());
  await expect(page.locator("[data-fixture-path]")).toHaveText("/p/main");
  await expect(page.locator("[data-page-side-pane-panel]")).toHaveCount(0);
  await page.evaluate(() => window.pageLayoutFixture.router.history.forward());
  await expect(page.locator("[data-fixture-path]")).toContainText("p=child");
  await expect(page.locator("[data-page-side-pane-panel]")).toHaveAttribute("aria-hidden", "false");
});

for (const audience of ["public", "guest"]) {
  test(`${audience} pane promotion works without an application sidebar provider`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${fixture}?audience=${audience}`);
    await page.getByRole("button", { name: "Direct pane", exact: true }).click();
    const panel = page.locator("[data-page-side-pane-panel]");
    await expect(panel).toHaveAttribute("aria-hidden", "false");
    await settlePresentation(panel);
    const frame = panel.locator("[data-page-layout]");
    await frame.getByRole("link", { name: "Open as full page", exact: true }).click();
    await expect(page.locator("[data-fixture-path]")).toHaveText("/p/child");
    await expect(page.locator("[data-page-side-pane-panel]")).toHaveCount(0);
    await expect(
      page
        .locator('[data-page-side-pane-main] [data-page-layout="main"]')
        .getByLabel("Draft child"),
    ).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}

async function paneWidthRatio(page) {
  return page
    .locator("[data-page-side-pane-panel]")
    .evaluate(
      (panel) =>
        panel.getBoundingClientRect().width /
        panel.closest("[data-page-side-pane-shell]").getBoundingClientRect().width,
    );
}

for (const input of ["pointer", "keyboard"]) {
  test(`${input} resize collapses navigation and stops at two-thirds without navigating`, async ({
    page,
  }) => {
    await page.goto(`${fixture}?navigation`);
    const navigation = page.locator('[data-slot="sidebar"]');
    await expect(navigation).toHaveAttribute("data-state", "expanded");
    await page.getByRole("button", { name: "Direct pane", exact: true }).click();
    const panel = page.locator("[data-page-side-pane-panel]");
    await expect(panel.getByLabel("Draft child")).toHaveCount(1);
    await settlePresentation(panel);
    const handle = panel.getByRole("separator", { name: "Resize side pane" });
    if (input === "pointer") {
      const box = await handle.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(0, box.y + box.height / 2, { steps: 10 });
      await page.mouse.up();
    } else {
      await handle.focus();
      for (let step = 0; step < 30; step++) {
        await page.keyboard.press("ArrowLeft");
        await settlePresentation(panel);
      }
    }
    await expect(navigation).toHaveAttribute("data-state", "collapsed");
    await expect.poll(() => paneWidthRatio(page)).toBeCloseTo(2 / 3, 2);
    await expect(page.locator("[data-fixture-path]")).toHaveText("/p/main?p=child");
    await expect(page.locator("[data-page-side-pane-main]").getByLabel("Draft main")).toHaveCount(
      1,
    );
    await expect(panel.getByLabel("Draft child")).toHaveCount(1);
    expect(await page.evaluate(() => document.body.style.cursor)).toBe("");
    expect(await page.evaluate(() => document.body.style.userSelect)).toBe("");

    // The cap also follows the available workspace when the window gets narrower.
    await page.setViewportSize({ width: 900, height: 900 });
    await expect.poll(() => paneWidthRatio(page)).toBeLessThanOrEqual(2 / 3 + 0.001);
    await expect(panel).toHaveAttribute("aria-hidden", "false");
  });

  test(`${input} returning to default width reopens navigation`, async ({ page }) => {
    await page.goto(`${fixture}?navigation`);
    const navigation = page.locator('[data-slot="sidebar"]');
    await page.getByRole("button", { name: "Direct pane", exact: true }).click();
    const panel = page.locator("[data-page-side-pane-panel]");
    await expect(panel.getByLabel("Draft child")).toHaveCount(1);
    await settlePresentation(panel);
    const defaultWidth = (await panel.boundingBox()).width;
    const handle = panel.getByRole("separator", { name: "Resize side pane" });
    if (input === "pointer") {
      const box = await handle.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(0, box.y + box.height / 2, { steps: 10 });
      await page.mouse.up();
      await expect(navigation).toHaveAttribute("data-state", "collapsed");
      await expect.poll(() => paneWidthRatio(page)).toBeCloseTo(2 / 3, 2);
      await settlePresentation(page.locator('[data-slot="sidebar-wrapper"]'));
      const expanded = await handle.boundingBox();
      await page.mouse.move(expanded.x + expanded.width / 2, expanded.y + expanded.height / 2);
      await page.mouse.down();
      await page.mouse.move(1400 - defaultWidth, expanded.y + expanded.height / 2, { steps: 10 });
      await page.mouse.up();
    } else {
      await handle.focus();
      for (let step = 0; step < 20; step++) {
        await page.keyboard.press("ArrowLeft");
        await settlePresentation(panel);
      }
      await expect(navigation).toHaveAttribute("data-state", "collapsed");
      for (let step = 0; step < 20; step++) {
        await page.keyboard.press("ArrowRight");
        await settlePresentation(panel);
        if ((await navigation.getAttribute("data-state")) === "expanded") break;
      }
    }
    await expect(navigation).toHaveAttribute("data-state", "expanded");
    await expect.poll(async () => (await panel.boundingBox()).width).toBeCloseTo(defaultWidth, 0);
    await expect(page.locator("[data-fixture-path]")).toHaveText("/p/main?p=child");
    await expect(panel.getByLabel("Draft child")).toHaveCount(1);
  });

  test(`${input} shrinking still closes the side panel`, async ({ page }) => {
    await page.goto(fixture);
    await page.getByRole("button", { name: "Direct pane", exact: true }).click();
    const panel = page.locator("[data-page-side-pane-panel]");
    await expect(panel.getByLabel("Draft child")).toHaveCount(1);
    await settlePresentation(panel);
    const handle = panel.getByRole("separator", { name: "Resize side pane" });
    if (input === "pointer") {
      const box = await handle.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(1350, box.y + box.height / 2, { steps: 10 });
      await page.mouse.up();
    } else {
      await handle.focus();
      const renderedPanel = await panel.elementHandle();
      for (let step = 0; step < 20; step++) {
        await page.keyboard.press("ArrowRight");
        await settlePresentation(renderedPanel);
        if ((await page.locator("[data-fixture-path]").textContent()) === "/p/main") break;
      }
    }
    await expect(page.locator("[data-fixture-path]")).toHaveText("/p/main");
    await expect(panel).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.cursor)).toBe("");
    expect(await page.evaluate(() => document.body.style.userSelect)).toBe("");
  });
}

test("public panes resize within the cap without a navigation sidebar provider", async ({
  page,
}) => {
  await page.goto(`${fixture}?audience=public`);
  await page.getByRole("button", { name: "Direct pane", exact: true }).click();
  const panel = page.locator("[data-page-side-pane-panel]");
  await expect(panel.getByLabel("Draft child")).toHaveCount(1);
  await settlePresentation(panel);
  const handle = panel.getByRole("separator", { name: "Resize side pane" });
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(0, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => paneWidthRatio(page)).toBeCloseTo(2 / 3, 2);
  await expect(page.locator("[data-fixture-path]")).toHaveText("/p/main?p=child");
});

test("expanded pages participate in router back and forward navigation", async ({ page }) => {
  await page.goto(fixture);
  await page.getByRole("button", { name: "Direct pane", exact: true }).click();
  await page.getByRole("link", { name: "Open as full page", exact: true }).click();
  await expect(page.locator("[data-fixture-path]")).toHaveText("/p/child");
  await page.evaluate(() => window.pageLayoutFixture.router.history.back());
  await expect(page.locator("[data-fixture-path]")).toHaveText("/p/main?p=child");
  await expect(page.locator("[data-page-side-pane-panel]").getByLabel("Draft child")).toHaveCount(
    1,
  );
  await page.evaluate(() => window.pageLayoutFixture.router.history.forward());
  await expect(page.locator("[data-fixture-path]")).toHaveText("/p/child");
  await expect(page.locator("[data-page-side-pane-panel]")).toHaveCount(0);
});

test("full-page commands navigate directly even when the target editor is mounted", async ({
  page,
}) => {
  await page.goto(fixture);
  await page.getByRole("button", { name: "Direct pane", exact: true }).click();
  await page.evaluate(() => window.pageLayoutCommands.openPageInMainPane("child"));
  await expect(page.locator("[data-fixture-path]")).toHaveText("/p/child");
  await expect(page.locator("[data-page-side-pane-panel]")).toHaveCount(0);
  await page.evaluate(() => window.pageLayoutCommands.openDatabaseSidePane("database"));
  await expect
    .poll(() => page.evaluate(() => window.pageLayoutCommands.sidePaneDatabaseId))
    .toBe("database");
  await page.evaluate(() => window.pageLayoutCommands.openSidePaneAsFullPage());
  await expect
    .poll(() => page.evaluate(() => window.pageLayoutFixture.router.state.location.href))
    .toBe("/d/database");
  await expect(page.locator("[data-page-side-pane-panel]")).toHaveCount(0);
  await expect(page.locator("[data-fixture-database-main]")).toHaveText("Database route");
});

test("databases open directly in the main route", async ({ page }) => {
  await page.goto(fixture);
  await expect(page.getByLabel("Draft main")).toHaveCount(1);
  await page.evaluate(() => window.pageLayoutCommands.openDatabaseInMainPane("database"));
  await expect(page.locator("[data-fixture-database-main]")).toHaveText("Database route");
  await expect(page.locator("[data-page-side-pane-panel]")).toHaveCount(0);
});

test("returning to default width preserves manually collapsed navigation", async ({ page }) => {
  await page.goto(`${fixture}?navigation`);
  await page.getByRole("button", { name: "Direct pane", exact: true }).click();
  const panel = page.locator("[data-page-side-pane-panel]");
  await expect(panel.getByLabel("Draft child")).toHaveCount(1);
  await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click();
  const navigation = page.locator('[data-slot="sidebar"]');
  await expect(navigation).toHaveAttribute("data-state", "collapsed");
  await settlePresentation(page.locator('[data-slot="sidebar-wrapper"]'));
  const handle = panel.getByRole("separator", { name: "Resize side pane" });
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(0, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => paneWidthRatio(page)).toBeCloseTo(2 / 3, 2);
  const expanded = await handle.boundingBox();
  await page.mouse.move(expanded.x + expanded.width / 2, expanded.y + expanded.height / 2);
  await page.mouse.down();
  await page.mouse.move(700, expanded.y + expanded.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => paneWidthRatio(page)).toBeCloseTo(1 / 2, 2);
  await expect(navigation).toHaveAttribute("data-state", "collapsed");
});

test("automatic collapse and restore do not change the trigger preference", async ({ page }) => {
  await page.goto(`${fixture}?navigation`);
  const navigation = page.locator('[data-slot="sidebar"]');
  const trigger = page.getByRole("button", { name: "Toggle Sidebar", exact: true });
  await expect(navigation).toHaveAttribute("data-state", "expanded");

  await page.evaluate(() => window.pageLayoutSidebar.setAutoCollapsed(true));
  await expect(navigation).toHaveAttribute("data-state", "collapsed");
  expect(await page.evaluate(() => window.pageLayoutSidebar.preferredOpen)).toBe(true);
  // A manual open overrides the temporary collapse; the next click records a manual close.
  await trigger.click();
  await expect(navigation).toHaveAttribute("data-state", "expanded");
  await trigger.click();
  await expect(navigation).toHaveAttribute("data-state", "collapsed");
  expect(await page.evaluate(() => window.pageLayoutSidebar.preferredOpen)).toBe(false);

  await page.evaluate(() => window.pageLayoutSidebar.setAutoCollapsed(true));
  await page.evaluate(() => window.pageLayoutSidebar.setAutoCollapsed(false));
  await expect(navigation).toHaveAttribute("data-state", "collapsed");
  await page.getByRole("button", { name: "Direct pane", exact: true }).click();
  const panel = page.locator("[data-page-side-pane-panel]");
  await expect(panel.getByLabel("Draft child")).toHaveCount(1);
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(navigation).toHaveAttribute("data-state", "collapsed");

  await trigger.click();
  await expect(navigation).toHaveAttribute("data-state", "expanded");
  expect(await page.evaluate(() => window.pageLayoutSidebar.preferredOpen)).toBe(true);
});
