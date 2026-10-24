import { test, expect } from "@playwright/test";
const url = "/scripts/calendar/e2e/index.html?appSidebar=1";

test("application sidebar preserves tabs, trees, routes and customization", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  const sidebar = page.getByLabel("Application sidebar", { exact: true });
  await expect(sidebar.getByText("Sidebar workspace", { exact: true })).toBeVisible();
  await expect(sidebar).toHaveCSS("width", "288px");
  await expect(sidebar.getByRole("button", { name: "Home", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const sections = sidebar.getByLabel("Sidebar sections", { exact: true });
  await sections.getByRole("button", { name: "Favorites", exact: true }).click();
  await sections.getByRole("button", { name: "Expand Parent page", exact: true }).click();
  await expect(sections.getByRole("link", { name: "Child page", exact: true })).toBeVisible();
  await sections.getByRole("link", { name: "Child page", exact: true }).click();
  await expect(page.locator("[data-fixture-path]")).toHaveText("/p/child");
  await expect(sections.getByRole("link", { name: "Child page", exact: true })).toHaveAttribute(
    "data-active",
    "true",
  );
  await sections.getByRole("button", { name: "Expand Database", exact: true }).click();
  await expect(sections.getByRole("link", { name: "Default", exact: true })).toHaveAttribute(
    "href",
    "/d/database",
  );
  await sections.getByRole("link", { name: "Second view", exact: true }).click();
  await expect(page.locator("[data-fixture-path]")).toHaveText("/d/database?view=second");
  await sections.getByRole("link", { name: "Weekly meeting", exact: true }).click();
  await expect(page.locator("[data-fixture-path]")).toHaveText("/m/meeting");
  await sidebar.getByRole("button", { name: "Work", exact: true }).click();
  await expect(sections.getByRole("button", { name: "Recents", exact: true })).toBeVisible();
  await page.reload();
  await expect(sidebar.getByRole("button", { name: "Work", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await sidebar.getByRole("button", { name: "Home", exact: true }).click();
  await expect(sections.getByRole("link", { name: "Child page", exact: true })).toBeVisible();
  await sidebar.getByRole("button", { name: "Customize sidebar", exact: true }).click();
  await expect(sidebar.getByRole("button", { name: "Done", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    sidebar.getByRole("button", { name: "Customize sidebar", exact: true }),
  ).toBeVisible();
  await sidebar.getByRole("button", { name: "New page", exact: true }).click();
  await expect(page.locator("[data-fixture-path]")).toHaveText(/\/p\/created-/);
  await page.screenshot({
    animations: "disabled",
    path: ".dev/calendar-e2e-results/application-sidebar-light.png",
  });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await expect(sidebar.getByRole("link", { name: "Database", exact: true })).toHaveCSS(
    "color",
    "rgb(161, 161, 170)",
  );
  await page.screenshot({
    animations: "disabled",
    path: ".dev/calendar-e2e-results/application-sidebar-dark.png",
  });
  expect(errors).toEqual([]);
});

test("offcanvas collapse and mobile Sheet retain focus and editor shortcuts", async ({ page }) => {
  await page.goto(url);
  const trigger = page.getByRole("button", { name: "Toggle Sidebar", exact: true });
  const sidebar = page.getByLabel("Application sidebar", { exact: true });
  await expect(sidebar).toBeVisible();
  await trigger.click();
  await expect(sidebar).toHaveAttribute("inert", "");
  await expect(page.locator('[data-slot="sidebar-gap"]')).toHaveCSS("width", "0px");
  await trigger.click();
  await expect(sidebar).not.toHaveAttribute("inert");
  await page.getByRole("textbox", { name: "Editor", exact: true }).focus();
  await page.keyboard.press("Control+b");
  await expect(sidebar).not.toHaveAttribute("inert");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("dialog", { name: "Sidebar", exact: true })).not.toBeVisible();
  await trigger.click();
  const sheet = page.getByRole("dialog", { name: "Sidebar", exact: true });
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveCSS("width", "288px");
  await page.keyboard.press("Escape");
  await expect(sheet).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("section dragging saves order and customization completes through the controller", async ({
  page,
}) => {
  await page.goto(url);
  const sidebar = page.getByLabel("Application sidebar", { exact: true });
  await expect(sidebar.getByText("Sidebar workspace", { exact: true })).toBeVisible();
  const sections = sidebar.getByLabel("Sidebar sections", { exact: true });
  // Collapse the private tree so adjacent section headers are reliable drag targets.
  await sections.getByRole("button", { name: "Private", exact: true }).click();
  const from = await sections.getByRole("button", { name: "Meetings", exact: true }).boundingBox();
  const to = await sections.getByRole("button", { name: "Favorites", exact: true }).boundingBox();
  await page.mouse.move(from.x + 30, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 30, to.y + to.height / 2, { steps: 15 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.appSidebarFixture.saves.length)).toBe(1);
  const saved = await page.evaluate(() => window.appSidebarFixture.saves[0]);
  expect(
    saved.sidebarConfig.workspaceLayouts.workspace.tabs
      .find((tab) => tab.id === "home")
      .sections.map((section) => section.id),
  ).toEqual(["meetings", "favorites", "private"]);
  // dnd-kit deliberately captures clicks for 50ms after a completed drag.
  await page.waitForTimeout(60);
  await sidebar.getByRole("button", { name: "Customize sidebar", exact: true }).click();
  await sidebar.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    sidebar.getByRole("button", { name: "Customize sidebar", exact: true }),
  ).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.appSidebarFixture.saves.length)).toBe(2);
});

test("section options change counts, reorder, move and remove saved sections", async ({ page }) => {
  await page.goto(url + "&sectionMenus=1");
  const sidebar = page.getByLabel("Application sidebar", { exact: true });
  const sections = sidebar.getByLabel("Sidebar sections", { exact: true });
  const recents = sections.getByRole("list", { name: "Recents pages", exact: true });
  const privatePages = sections.getByRole("list", { name: "Private pages", exact: true });
  const favorites = sections.getByRole("list", { name: "Favorite pages", exact: true });
  await expect(recents.locator(":scope > li")).toHaveCount(6);
  await expect(privatePages.locator(":scope > li")).toHaveCount(11);
  await expect(favorites.locator(":scope > li")).toHaveCount(11);
  for (const [label, view] of [
    ["Recents", "recents"],
    ["Favorites", "favourites"],
    ["Private", "private"],
    ["Meetings", "meetings"],
    ["Shared", "shared"],
    ["Teamspaces", "teamspaces"],
  ]) {
    await expect(
      sections.getByRole("button", { name: `${label} section options`, exact: true }),
    ).toBeAttached();
    const link = sections.getByRole("link", { name: `View all ${label}`, exact: true });
    await expect(link).toHaveAttribute("href", `/recents?view=${view}`);
    await link.click();
    await expect(page.locator("[data-fixture-path]")).toHaveText(`/recents?view=${view}`);
  }
  await sections.getByRole("button", { name: "Recents section options", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Move up", exact: true })).toBeDisabled();
  await page.screenshot({
    animations: "disabled",
    path: ".dev/calendar-e2e-results/sidebar-section-options-light.png",
  });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.screenshot({
    animations: "disabled",
    path: ".dev/calendar-e2e-results/sidebar-section-options-dark.png",
  });
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.getByRole("menuitem", { name: /Show/ }).hover();
  await page.getByRole("menuitem", { name: "10 items", exact: true }).click();
  await expect(recents.locator(":scope > li")).toHaveCount(11);
  await expect.poll(() => page.evaluate(() => window.appSidebarFixture.saves.length)).toBe(1);
  await page.reload();
  await expect(recents.locator(":scope > li")).toHaveCount(11);
  await sections.getByRole("button", { name: "Recents section options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Move down", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.appSidebarFixture.saves.at(-1).sidebarConfig.workspaceLayouts.workspace.tabs[0]
            .sections[0].kind,
      ),
    )
    .toBe("favorites");
  await sections.getByRole("button", { name: "Recents section options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Move up", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.appSidebarFixture.saves.at(-1).sidebarConfig.workspaceLayouts.workspace.tabs[0]
            .sections[0].kind,
      ),
    )
    .toBe("recents");
  await sections.getByRole("button", { name: "Private section options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Move to tab", exact: true }).hover();
  await page.getByRole("menuitem", { name: "Work", exact: true }).click();
  await expect(
    sections.getByRole("button", { name: "Private section options", exact: true }),
  ).toHaveCount(0);
  await sidebar.getByRole("button", { name: "Work", exact: true }).click();
  await expect(
    sections.getByRole("button", { name: "Private section options", exact: true }),
  ).toBeAttached();
  await sections.getByRole("button", { name: "Private section options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Remove section", exact: true }).click();
  await expect(
    sections.getByRole("button", { name: "Private section options", exact: true }),
  ).toHaveCount(0);
  await sections.getByRole("button", { name: "Recents section options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Customize sidebar", exact: true }).click();
  await expect(sidebar.getByRole("button", { name: "Done", exact: true })).toBeVisible();
});
