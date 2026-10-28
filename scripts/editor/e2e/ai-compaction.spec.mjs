import { test, expect } from "@playwright/test";

test("disabled semantic search is shown as unavailable with a useful explanation", async ({
  page,
}) => {
  await page.goto("/scripts/editor/e2e/ai-components.html?activity-message=1");
  await page.getByRole("button", { name: "Unavailable semantic search", exact: true }).click();
  const reading = page.getByLabel("Source reading activity");
  await expect(reading).toContainText("Semantic search disabled");
  await reading.getByRole("button", { name: /Semantic search disabled/ }).click();
  await expect(reading).toContainText("disabled in this workspace");
  await expect(reading).not.toContainText("0 matching sources");
});

for (const width of [1400, 390]) {
  test(`${width}: compaction shows live progress and a completed disclosure without replacing the conversation`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/scripts/editor/e2e/ai-components.html?activity-message=1");
    await page.getByRole("button", { name: "Start compaction", exact: true }).click();
    const compaction = page.getByLabel("Conversation compaction", { exact: true });
    await expect(compaction).toContainText("Compacting conversation");
    await expect(compaction).toContainText("Your messages remain in the chat");
    await expect(page.getByRole("status", { name: "Thinking", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Complete compaction", exact: true }).click();
    await expect(compaction).toContainText("Conversation compacted");
    await compaction.getByRole("button", { name: /Conversation compacted/ }).click();
    await expect(compaction).toContainText("24 messages summarized");
    await expect(page.locator(".is-assistant")).toContainText("The earlier decision is preserved");
    await expect(page.getByRole("button", { name: "Continue reading", exact: true })).toHaveCount(
      0,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath("compaction.png") });
  });
}

test("failed and interrupted compaction preserve the conversation and expose a retry explanation", async ({
  page,
}) => {
  await page.goto("/scripts/editor/e2e/ai-components.html?activity-message=1");
  await page.getByRole("button", { name: "Start compaction", exact: true }).click();
  await page.getByRole("button", { name: "Stop answer", exact: true }).click();
  const compaction = page.getByLabel("Conversation compaction", { exact: true });
  await expect(compaction).toContainText("Compaction interrupted");
  await compaction.getByRole("button", { name: /Compaction interrupted/ }).click();
  await expect(compaction).toContainText("original conversation is preserved");
  await page.getByRole("button", { name: "Fail compaction", exact: true }).click();
  await expect(compaction).toContainText("Couldn't compact conversation");
  await expect(compaction).toContainText("Retry your message");
});
