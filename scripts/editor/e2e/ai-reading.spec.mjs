import { test, expect } from "@playwright/test";

const title = "Customer feedback review";
async function openReadHistory(
  page,
  { partial = false, stopped = false, failed = false, legacy = false, search = false } = {},
) {
  await page.addInitScript(
    ({ title, partial, stopped, failed, legacy, search }) => {
      if (sessionStorage.getItem("ai-fixture-threads")) return;
      const at = "2026-10-20T00:00:00Z";
      const source = { type: "page", id: "main" };
      const calls = [
        {
          id: "first",
          name: "read_page",
          label: "Reading page",
          status: "completed",
          returned: 10,
          hasMore: true,
        },
        {
          id: "next",
          name: "read_page",
          label: "Reading page",
          status: failed ? "failed" : stopped ? "running" : "completed",
          returned: 1,
          hasMore: partial,
          ...(failed ? { error: "SOURCE_UNAVAILABLE" } : {}),
        },
      ].map((call) => (legacy ? call : { ...call, source }));
      if (search)
        calls.unshift({
          id: "search",
          name: search === "semantic" ? "semantic_search_workspace" : "search_workspace",
          label: "Searching workspace",
          query: "customer feedback",
          status: failed ? "failed" : "completed",
          returned: failed ? undefined : 2,
          hasMore: false,
        });
      const context = {
        version: 1,
        markdown: "",
        charCount: 0,
        status: partial ? "partial" : "complete",
        omissions: [],
        trimmedAttachmentIds: [],
        manifest: [
          {
            ...source,
            key: "page:main",
            pageId: "main",
            title,
            provenance: { capturedAt: at, origin: "saved" },
          },
        ],
      };
      sessionStorage.setItem(
        "ai-fixture-threads",
        JSON.stringify([
          {
            thread: {
              id: "00000000-0000-4000-8000-000000000111",
              workspaceId: "workspace",
              title: "Review feedback",
              updatedAt: at,
            },
            roots: [source],
            messages: [
              { id: "user", role: "user", text: "Summarize the attached page" },
              {
                id: "assistant",
                role: "assistant",
                text: "The review covers themes, decisions, and follow-up work.",
                status: stopped ? "stopped" : failed ? "failed" : "completed",
                roots: [source],
                context,
                progress: { activities: calls, canContinue: partial },
              },
            ],
          },
        ]),
      );
    },
    { title, partial, stopped, failed, legacy, search },
  );
  await page.goto("/scripts/editor/e2e/page-layout.html?workspace=ai&appSidebar=1");
  const conversation = page
    .getByRole("list", { name: "AI chats", exact: true })
    .getByRole("button", { name: "Review feedback", exact: true });
  if (!(await conversation.isVisible()))
    await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click();
  await conversation.click();
}

for (const search of ["keyword", "semantic"])
  for (const failed of [false, true]) {
    test(`${search} search activity renders ${failed ? "failure" : "matches"} without a fake source`, async ({
      page,
    }) => {
      await openReadHistory(page, { search, failed });
      const reading = page.getByLabel("Source reading activity", { exact: true });
      await expect(reading.locator("[data-ai-read-source]")).toHaveCount(1);
      await reading
        .getByRole("button", {
          name: failed
            ? new RegExp(`Couldn't finish ${search} search`)
            : new RegExp(`${search === "keyword" ? "Keyword" : "Semantic"} search completed`),
        })
        .click();
      await expect(reading).toContainText(
        failed ? "Workspace search couldn't finish." : "“customer feedback” · 2 matching sources",
      );
      await expect(reading).not.toContainText("Source details are unavailable");
    });
  }

for (const width of [1400, 390]) {
  test(`one page stays one named reading pill across chunks at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openReadHistory(page);
    const reading = page.getByLabel("Source reading activity", { exact: true });
    await expect(reading.locator("[data-ai-read-source]")).toHaveCount(1);
    await expect(reading).toContainText("Page read");
    const accordion = reading.getByRole("button", { name: /Page read/ });
    await expect(accordion).toHaveAttribute("aria-expanded", "false");
    await accordion.click();
    await expect(accordion).toHaveAttribute("aria-expanded", "true");
    await expect(reading.getByRole("link", { name: "main", exact: true })).toBeVisible();
    await expect(reading).not.toContainText("items");
    await expect(reading).not.toContainText("Output");
    await expect(reading).not.toContainText("More of this page");
    const fits = await reading.evaluate((el) => el.scrollWidth <= el.clientWidth);
    expect(fits).toBe(true);
    await accordion.click();
    await expect(reading.getByRole("link", { name: "main", exact: true })).toBeHidden();
  });
}

for (const [options, label] of [
  [{ partial: true }, "Partially read"],
  [{ stopped: true }, "Reading stopped"],
  [{ failed: true }, "Couldn't read source"],
  [{ legacy: true }, "Page read"],
]) {
  test(`reading history shows ${label}`, async ({ page }) => {
    await openReadHistory(page, options);
    const reading = page.getByLabel("Source reading activity", { exact: true });
    await expect(reading.locator("[data-ai-read-source]")).toHaveCount(1);
    await expect(reading).toContainText(label);
    await reading.getByRole("button", { name: new RegExp(label) }).click();
    await expect(reading.getByRole("link", { name: "main", exact: true })).toBeVisible();
    if (options.partial) await expect(reading).toContainText("More of this page is available");
  });
}
