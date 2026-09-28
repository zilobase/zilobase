import { parseHTML } from "linkedom";

export function register({ assert, loadModule, test }) {
  test("mounted views share confirmed queries while sort previews stay outside the fetch cache", async () => {
    const saved = Object.getOwnPropertyDescriptors(globalThis);
    const { window, document } = parseHTML("<html><body><div id='root'></div></body></html>");
    Object.assign(globalThis, {
      window,
      document,
      HTMLElement: window.HTMLElement,
      Node: window.Node,
    });
    let fixture;
    const until = async (condition) => {
      for (let i = 0; i < 50 && !condition(); i++)
        await new Promise((resolve) => setTimeout(resolve, 5));
      assert.ok(condition(), "query reconciliation did not settle");
    };
    try {
      const { mountQueryReconciliation } = await loadModule(
        "/apps/web/test/support/fixtures/database-query-reconciliation.tsx",
      );
      fixture = mountQueryReconciliation(document.getElementById("root"));
      await until(
        () =>
          fixture.output.table?.status === "success" && fixture.output.kanban?.status === "success",
      );
      assert.equal(fixture.requests.length, 1, "same-query views must deduplicate reads");
      const originalHash = fixture.output.table.hash;
      fixture.edit();
      await until(() => fixture.output.table.config.sorts?.length === 1);
      assert.deepEqual(fixture.rawConfig(), {}, "pending sort must not change the server snapshot");
      assert.equal(fixture.output.table.hash, originalHash);
      assert.equal(fixture.output.kanban.hash, originalHash);
      assert.equal(fixture.requests.length, 1, "pending config must not start a saved-view fetch");
      fixture.confirm();
      await until(
        () =>
          fixture.output.table.hash !== originalHash && fixture.output.table.status === "success",
      );
      assert.equal(fixture.output.kanban.hash, originalHash);
      assert.ok(
        fixture.requests.some((path) =>
          path.includes(`expectedQueryHash=${fixture.output.table.hash}`),
        ),
      );
    } finally {
      fixture?.close();
      await new Promise((resolve) => setTimeout(resolve, 10));
      for (const key of Object.keys(globalThis)) if (!(key in saved)) delete globalThis[key];
      Object.defineProperties(globalThis, saved);
    }
  });
}
