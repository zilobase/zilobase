import { expect, type Page } from "@playwright/test";
export async function checkVerificationBrowser(
  page: Page,
  {
    origin,
    pageId,
    backgroundPageId,
  }: { origin: string; pageId: string; backgroundPageId: string },
) {
  await page.goto(`${origin}/p/${pageId}`, { waitUntil: "domcontentloaded" });
  const open = async (scope = page as Page | import("@playwright/test").Locator) => {
    await scope.getByRole("button", { name: "More page actions", exact: true }).last().click();
    await page.getByRole("menuitem").filter({ hasText: "Verification" }).click();
    const dialog = page.getByRole("dialog", { name: "Content verification", exact: true });
    await expect(dialog.getByRole("status")).toContainText("Status:");
    return dialog;
  };
  let dialog = await open();
  await dialog.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const badge = page.getByRole("button", { name: "Verified page", exact: true });
  await expect(badge).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Verified: view verification", exact: true }),
  ).toBeVisible();
  // The badge belongs between the breadcrumb title and collaboration status.
  await expect(badge.locator("xpath=following-sibling::*[1]")).toHaveAttribute("role", "status");
  await badge.click();
  dialog = page.getByRole("dialog", { name: "Content verification", exact: true });
  await expect(dialog.getByRole("status")).toHaveText("Status: Verified");
  await dialog.getByLabel("Verify indefinitely").uncheck();
  await dialog.getByLabel("Verification expiry").fill("2030-01-01T12:00");
  await dialog.getByRole("button", { name: "Reverify", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  dialog = await open();
  await expect(dialog.getByLabel("Verification expiry")).toHaveValue("2030-01-01T12:00");
  const pattern = `**/pages/${pageId}/verification`;
  const fail = async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({ status: 500, json: { error: "Fixture save failure" } });
    else await route.continue();
  };
  await page.route(pattern, fail);
  await dialog.getByRole("button", { name: "Reverify", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await page.unroute(pattern, fail);
  await dialog.getByRole("button", { name: "Remove verification", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(badge).toHaveCount(0);
  await page.getByRole("button", { name: "Unverified: view verification", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Content verification", exact: true });
  await expect(dialog.getByRole("status")).toHaveText("Status: Unverified");
  await page.keyboard.press("Escape");
  const reader = async (route) => {
    const result = await route.fetch();
    const data = await result.json();
    const now = new Date().toISOString();
    await route.fulfill({
      response: result,
      json: {
        ...data,
        canManage: false,
        verification: {
          state: "verified",
          verifiedAt: now,
          verifiedById: null,
          expiresAt: new Date(Date.now() + 2000).toISOString(),
          revision: now,
        },
      },
    });
  };
  await page.route(pattern, reader);
  dialog = await open();
  await expect(dialog.getByRole("button", { name: "Verify", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("status")).toHaveText("Status: Expired", { timeout: 10000 });
  await page.keyboard.press("Escape");
  await page.unroute(pattern, reader);
  // The shared page header must offer the same action in side panes and dialogs.
  await page.goto(`${origin}/p/${backgroundPageId}?p=${pageId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Open pages as", exact: true })).toBeVisible({
    timeout: 30000,
  });
  dialog = await open();
  await expect(dialog.getByRole("status")).toContainText("Status:");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Open pages as", exact: true }).click();
  await page.getByRole("menuitem", { name: "Dialog", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "Page preview", exact: true });
  await expect(preview).toBeVisible();
  dialog = await open(preview);
  await expect(dialog.getByRole("status")).toContainText("Status:");
  await page.keyboard.press("Escape");
  await page.screenshot({ path: ".test-results/search/browser-verification.png" });
}

export async function checkDatabaseVerificationBrowser(
  page: Page,
  { origin, apiOrigin, workspaceId }: { origin: string; apiOrigin: string; workspaceId: string },
) {
  const command = async (path: string, command: unknown) => {
    const response = await page.request.post(`${apiOrigin}${path}`, {
      headers: { origin: apiOrigin },
      data: { protocolVersion: 2, commandId: crypto.randomUUID(), command },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()).result;
  };
  const created = await command("/databases/commands", {
    type: "database.create",
    workspaceId,
    name: "Verification browser proof",
    standalone: true,
  });
  const databaseId = created.database.id,
    sourceId = created.activeDataSource.id;
  const path = `/databases/${databaseId}/data-sources/${sourceId}/commands`;
  const column = await command(path, {
    type: "property.create",
    name: "Verification",
    propertyType: "verification",
    config: {},
    beforePropertyId: null,
    afterPropertyId: null,
  });
  const row = await command(path, {
    type: "row.place",
    title: "Verified database page",
    beforeRowId: null,
    afterRowId: null,
    parentRowId: null,
  });
  await page.goto(`${origin}/d/${databaseId}`, { waitUntil: "domcontentloaded" });
  const cell = page
    .locator(".database-value-cell")
    .getByRole("button", { name: "Unverified: view verification", exact: true });
  await expect(cell).toBeVisible({ timeout: 30000 });
  await cell.click();
  const dialog = page.getByRole("dialog", { name: "Content verification", exact: true });
  await expect(dialog.getByRole("button", { name: "Verify", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page
      .locator(".database-value-cell")
      .getByRole("button", { name: "Verified: view verification", exact: true }),
  ).toBeVisible();
  const propertiesResponse = await page.request.get(`${apiOrigin}/pages/${row.pageId}/properties`);
  expect(propertiesResponse.ok()).toBe(true);
  const payload = await propertiesResponse.json();
  expect(payload.values.find((value) => value.propertyId === column.property.id)?.value.state).toBe(
    "verified",
  );
  await page.goto(`${origin}/p/${row.pageId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Verified page", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Verified: view verification", exact: true }).click();
  await page.getByRole("button", { name: "Remove verification", exact: true }).click();
  await expect(page.getByRole("button", { name: "Verified page", exact: true })).toHaveCount(0);
  await page.goto(`${origin}/d/${databaseId}`, { waitUntil: "domcontentloaded" });
  await expect(
    page
      .locator(".database-value-cell")
      .getByRole("button", { name: "Unverified: view verification", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: ".test-results/search/browser-database-verification.png" });
}
