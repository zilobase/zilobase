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
  dialog = await open();
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
  dialog = await open();
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
