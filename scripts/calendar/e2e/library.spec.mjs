import { test, expect } from "@playwright/test";
const url = "/scripts/calendar/e2e/index.html?appSidebar=1&library=1";
const row = (page, id) => page.locator(`.database-table-wrap [data-database-row-id="page:${id}"]`);
const surface = (page) => page.locator(".database-table-wrap");

test("Library creates child and root pages, selects records and drags real page references", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
  await expect(row(page, "parent")).toBeVisible();
  await expect(surface(page)).toHaveAttribute("data-database-marquee-surface", "true");
  await expect(row(page, "child")).toHaveCount(0);
  await page.getByRole("button", { name: "Expand sub-items for Parent page", exact: true }).click();
  await expect(row(page, "child")).toBeVisible();
  await page.getByRole("button", { name: "New sub-item", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.appSidebarFixture.createdPageRequests.length))
    .toBe(1);
  expect(await page.evaluate(() => window.appSidebarFixture.createdPageRequests[0])).toMatchObject({
    workspaceId: "workspace",
    parentItemId: "parent",
  });
  await expect(row(page, "created-3")).toBeVisible();
  await surface(page).getByRole("button", { name: "New page", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.appSidebarFixture.createdPageRequests.length))
    .toBe(2);
  expect(
    await page.evaluate(() => window.appSidebarFixture.createdPageRequests[1]),
  ).not.toHaveProperty("parentItemId");
  await row(page, "parent").hover();
  await page.getByRole("checkbox", { name: "Select Parent page", exact: true }).check();
  await expect(row(page, "parent")).toHaveAttribute("data-row-selected", "true");
  await expect(page.getByRole("toolbar", { name: "Selected Library items" })).toBeVisible();
  await page.getByRole("button", { name: "Clear selection of 1 items", exact: true }).click();
  const handle = page.getByRole("button", { name: "Drag Parent page", exact: true });
  await row(page, "parent").hover();
  await expect(handle).toHaveAttribute("draggable", "true");
  const payload = await handle.evaluate((node) => {
    const dataTransfer = new DataTransfer();
    node.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer }));
    const result = Object.fromEntries(
      [...dataTransfer.types].map((type) => [type, dataTransfer.getData(type)]),
    );
    node.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer }));
    return result;
  });
  expect(JSON.parse(payload["application/x-zilobase-database-page"])).toMatchObject({
    pageId: "parent",
  });
  expect(errors).toEqual([]);
});

test("Library marquee and persisted reordering retain read-only metadata", async ({ page }) => {
  await page.goto(url);
  await expect(row(page, "parent")).toBeVisible();
  await page.getByRole("button", { name: "Expand sub-items for Parent page", exact: true }).click();
  const bounds = await surface(page).boundingBox();
  const parent = await row(page, "parent").boundingBox();
  const child = await row(page, "child").boundingBox();
  await page.mouse.move(bounds.x - 100, child.y + child.height);
  await page.mouse.down();
  await page.mouse.move(parent.x + 180, parent.y + 3, { steps: 12 });
  await page.mouse.up();
  await expect(row(page, "parent")).toHaveAttribute("data-row-selected", "true");
  await expect(row(page, "child")).toHaveAttribute("data-row-selected", "true");
  await page.getByRole("button", { name: /Clear selection of/ }).click();
  const handle = page.getByRole("button", { name: "Drag Peer page", exact: true });
  await row(page, "peer").hover();
  await handle.evaluate(async (node) => {
    const dataTransfer = new DataTransfer();
    node.dispatchEvent(
      new DragEvent("dragstart", {
        bubbles: true,
        dataTransfer,
        clientX: node.getBoundingClientRect().x,
        clientY: node.getBoundingClientRect().y,
      }),
    );
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const surface = node.closest(".database-table-wrap");
    const target = surface.querySelector('[data-database-row-id="page:parent"]');
    const rect = target.getBoundingClientRect();
    surface.dispatchEvent(
      new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientX: rect.x + 10,
        clientY: rect.y + 1,
      }),
    );
    surface.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientX: rect.x + 10,
        clientY: rect.y + 1,
      }),
    );
    node.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer }));
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.appSidebarFixture.saves.some((save) =>
          Boolean(save.sidebarConfig?.libraryOrders?.workspace?.recents),
        ),
      ),
    )
    .toBe(true);
  const order = await page.evaluate(
    () => window.appSidebarFixture.saves.at(-1).sidebarConfig.libraryOrders.workspace.recents,
  );
  expect(order.indexOf("page:peer")).toBeLessThan(order.indexOf("page:parent"));
  await page.reload();
  await expect(row(page, "parent")).toBeVisible();
  await expect(row(page, "child")).toHaveCount(0);
  expect((await row(page, "peer").boundingBox()).y).toBeLessThan(
    (await row(page, "parent").boundingBox()).y,
  );
  expect(
    await page.evaluate(() =>
      window.appSidebarFixture.requests.some(
        (request) => !request.startsWith("GET ") && request.includes("/databases/homepage"),
      ),
    ),
  ).toBe(false);
});
