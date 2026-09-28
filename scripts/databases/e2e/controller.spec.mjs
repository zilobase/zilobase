import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/scripts/databases/e2e/index.html");
  await expect(page.locator('[data-row="a"]')).toBeVisible();
});

test("native Kanban drag remains projected through delayed save and stale refresh", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page
    .locator('[data-row="a"]')
    .dragTo(page.locator('[data-column="Done"]'), { targetPosition: { x: 100, y: 100 } });
  await expect(page.locator('[data-column="Done"] [data-row="a"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.board.requests.length)).toBe(1);
  await page.evaluate(() =>
    window.board.refresh(
      ["a", "b", "c"],
      { "a:status": "Todo", "b:status": "Done", "c:status": "Done" },
      1,
    ),
  );
  await expect(page.locator('[data-column="Done"] [data-row="a"]')).toBeVisible();
  await page.evaluate(() => window.board.requests[0].resolve(2));
  await expect(page.locator('[data-column="Done"] [data-row="a"]')).toBeVisible();
  await page.evaluate(() =>
    window.board.refresh(window.board.read().order, window.board.read().values, 2),
  );
  await expect.poll(() => page.evaluate(() => window.board.read().pending)).toBe(false);
  expect(errors).toEqual([]);
});

test("mounted table and Kanban share confirmed query identity while settings preview immediately", async ({
  page,
}) => {
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.values(window.queries.output).every((view) => view.status === "success"),
      ),
    )
    .toBe(true);
  const initial = await page.evaluate(() => window.queries.output.table.hash);
  await page.evaluate(() => window.queries.edit());
  await expect
    .poll(() => page.evaluate(() => window.queries.output.table.config))
    .toEqual({ sorts: [{ column: "name", direction: "descending" }] });
  expect(await page.evaluate(() => window.queries.output.table.hash)).toBe(initial);
  expect(await page.evaluate(() => window.queries.rawConfig())).toEqual({});
  await page.evaluate(() => window.queries.confirm());
  await expect.poll(() => page.evaluate(() => window.queries.output.table.hash)).not.toBe(initial);
  expect(await page.evaluate(() => window.queries.output.kanban.hash)).toBe(initial);
});

test("browser demo receipts survive replay and refresh without any write request", async ({
  page,
}) => {
  const writes = [];
  page.on("request", (request) => {
    if (request.method() === "POST") writes.push(request.url());
  });
  const result = await page.evaluate(() => {
    const runtime = new window.DemoDatabaseRuntime(() => new Error("guarded"));
    const { bootstrap, window: records } = window.demoDatabaseFixture();
    const url = (path) => new URL(path, "https://demo.localhost");
    runtime.capture(url("/databases/demo-db/bootstrap"), bootstrap);
    runtime.capture(url("/databases/demo-db/data-sources/demo-source/records"), records);
    const target = url("/databases/demo-db/data-sources/demo-source/commands");
    const command = {
      protocolVersion: 2,
      commandId: "browser-move",
      command: {
        type: "row.change",
        rowId: "demo-row",
        placement: { afterRowId: "other-row", beforeRowId: null },
      },
    };
    const ack = runtime.command(target, command);
    const replay = runtime.command(target, command);
    const read = runtime.read(
      url(
        `/databases/demo-db/data-sources/demo-source/records?viewId=table&expectedQueryHash=${records.queryHash}`,
      ),
    );
    return { ack, replay, order: read.records.map(({ id }) => id) };
  });
  expect(result.replay).toEqual(result.ack);
  expect(result.ack.sourceVersions["demo-source"]).toBe(8);
  expect(result.order).toEqual(["other-row", "demo-row"]);
  expect(writes).toEqual([]);
});
