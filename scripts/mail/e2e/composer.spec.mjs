import { test, expect } from "@playwright/test";
const fixture = "/scripts/mail/e2e/index.html";
async function intercept(page, handler) {
  await page.route("**/workspaces/workspace/mail/**", async (route) => {
    const request = route.request();
    await handler(route, request.method(), new URL(request.url()).pathname, request.postDataJSON());
  });
}
const saved = { draftId: "draft", message: { id: "draft-message" } };
test("close flushes text before the autosave debounce", async ({ page }) => {
  const writes = [];
  await intercept(page, async (route, method, path, body) => {
    writes.push({ method, path, body });
    await route.fulfill({ json: saved });
  });
  await page.goto(fixture);
  await page.getByRole("textbox", { name: "Message body" }).fill("Latest unsaved text");
  await page.getByRole("button", { name: "Close mail composer" }).click();
  await expect(page.getByText("Composer closed")).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0].body.bodyText).toBe("Latest unsaved text");
});
test("discard waits for an in-flight creation then deletes its draft", async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const writes = [];
  await intercept(page, async (route, method) => {
    writes.push(method);
    if (method === "POST") {
      await gate;
      await route.fulfill({ json: saved });
    } else await route.fulfill({ status: 204 });
  });
  await page.goto(fixture);
  await page.getByRole("textbox", { name: "Message body" }).fill("Draft");
  await expect.poll(() => writes.length).toBe(1);
  await page.getByRole("button", { name: "Discard" }).click();
  release();
  await expect(page.getByText("Composer closed")).toBeVisible();
  expect(writes).toEqual(["POST", "DELETE"]);
});
test("resumed drafts update their existing provider identity", async ({ page }) => {
  const writes = [];
  await intercept(page, async (route, method, path) => {
    writes.push({ method, path });
    await route.fulfill({ json: { ...saved, draftId: "existing" } });
  });
  await page.goto(`${fixture}?resume`);
  await expect(page.getByRole("textbox", { name: "Message body" })).toHaveValue("Saved body");
  await page.getByRole("textbox", { name: "Message body" }).fill("Edited body");
  await page.getByRole("button", { name: "Close mail composer" }).click();
  await expect(page.getByText("Composer closed")).toBeVisible();
  expect(
    writes.every((write) => write.method === "PUT" && write.path.endsWith("/drafts/existing")),
  ).toBe(true);
});
test("a failed close keeps the composer and content available", async ({ page }) => {
  await intercept(page, (route) =>
    route.fulfill({ status: 503, json: { message: "Provider unavailable" } }),
  );
  await page.goto(fixture);
  await page.getByRole("textbox", { name: "Message body" }).fill("Keep this text");
  await page.getByRole("button", { name: "Close mail composer" }).click();
  await expect(page.getByText("Provider unavailable")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message body" })).toHaveValue("Keep this text");
});
test("uncertain send retries the same operation without rewriting a deleted draft", async ({
  page,
}) => {
  const writes = [];
  let sends = 0;
  await intercept(page, async (route, method, path, body) => {
    writes.push({ method, path, body });
    if (path.endsWith("/send")) {
      sends++;
      await route.fulfill(
        sends === 1
          ? { status: 504, json: { message: "Uncertain delivery" } }
          : { json: { messageId: "sent", message: null, reused: true } },
      );
    } else await route.fulfill({ json: saved });
  });
  await page.goto(fixture);
  await page.getByRole("textbox", { name: "To", exact: true }).fill("recipient@example.test");
  await page.getByRole("textbox", { name: "Message body" }).fill("Send once");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Uncertain delivery")).toBeVisible();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Composer closed")).toBeVisible();
  const attempts = writes.filter((write) => write.path.endsWith("/send"));
  expect(attempts).toHaveLength(2);
  expect(attempts[0].body).toEqual(attempts[1].body);
  expect(writes.filter((write) => !write.path.endsWith("/send"))).toHaveLength(1);
});
test("composer appearance matches the pre-change implementation", async ({ page }, testInfo) => {
  await page.goto(`${fixture}?baseline`);
  const baseline = page.getByRole("complementary", { name: "Mail composer" });
  await expect(baseline).toBeVisible();
  await expect(baseline).toHaveCSS("position", "fixed");
  await page.evaluate(() => document.fonts.ready);
  const before = await baseline.screenshot({
    animations: "disabled",
    caret: "hide",
    path: testInfo.outputPath("composer-before.png"),
  });
  await page.goto(fixture);
  const current = page.getByRole("complementary", { name: "Mail composer" });
  await expect(current).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const after = await current.screenshot({
    animations: "disabled",
    caret: "hide",
    path: testInfo.outputPath("composer-after.png"),
  });
  expect(after.equals(before)).toBe(true);
});

test("polling receives while visible, pauses offline, and recovers on return", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    window.WebSocket = undefined;
  });
  await page.clock.install();
  await page.goto(`${fixture}?poll`);
  await expect(page.getByText("Syncs: 0")).toBeVisible();
  await page.clock.runFor(70_000);
  await expect(page.getByText("Syncs: 1")).toBeVisible();
  await context.setOffline(true);
  await page.clock.runFor(70_000);
  await expect(page.getByText("Syncs: 1")).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText("Syncs: 2")).toBeVisible();
});
test("definite send rejection permits correcting the recipient", async ({ page }) => {
  let sends = 0;
  await intercept(page, async (route, _method, path, body) => {
    if (path.endsWith("/send")) {
      if (++sends === 1)
        await route.fulfill({ status: 400, json: { message: "Invalid recipient" } });
      else {
        expect(body.to[0].address).toBe("correct@example.test");
        await route.fulfill({ json: { messageId: "sent", message: null, reused: false } });
      }
    } else await route.fulfill({ json: saved });
  });
  await page.goto(fixture);
  const to = page.getByRole("textbox", { name: "To", exact: true });
  await to.fill("wrong@example.test");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Invalid recipient")).toBeVisible();
  await to.fill("correct@example.test");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Composer closed")).toBeVisible();
});
