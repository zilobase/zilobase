import assert from "node:assert/strict";
import test from "node:test";
import { createMutationTestRuntime } from "../shared/mutation-runtime.test";
import { useEmbedPageItem } from "./placement-mutations";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

for (const kind of ["page", "database"] as const) {
  for (const refreshFails of [false, true]) {
    test(`${kind} embed settles before navigation refresh (${refreshFails ? "failed" : "successful"} refresh)`, async () => {
      const save = Promise.withResolvers<void>();
      const refresh = Promise.withResolvers<void>();
      const payload = { action: "addLink", host: { workspaceId: "workspace" } };
      const { mutation, queryClient } = createMutationTestRuntime(useEmbedPageItem, async <T>() => {
        await save.promise;
        return payload as T;
      });
      let invalidations = 0;
      queryClient.invalidateQueries = () => {
        invalidations++;
        return refresh.promise;
      };
      let settled = false;
      const completion = mutation
        .mutateAsync({ hostPageId: "host", itemId: "child", kind })
        .then((result) => {
          settled = true;
          return result;
        });
      try {
        await tick();
        assert.equal(settled, false, "server acceptance is still required");
        save.resolve();
        await tick();
        const settledBeforeRefresh = settled;
        if (refreshFails) refresh.reject(new Error("Navigation unavailable"));
        else refresh.resolve();
        assert.deepEqual(await completion, payload);
        assert.equal(settledBeforeRefresh, true, "navigation must not delay saved embeds");
        assert.equal(invalidations, 1);
      } finally {
        save.resolve();
        refresh.resolve();
        queryClient.clear();
      }
    });
  }
}

test("rejected embed propagates the save error without refreshing navigation", async () => {
  const failure = new Error("Forbidden");
  const { mutation, queryClient } = createMutationTestRuntime(useEmbedPageItem, async () => {
    throw failure;
  });
  queryClient.invalidateQueries = () => assert.fail("must not refresh a rejected embed");
  try {
    await assert.rejects(
      mutation.mutateAsync({ hostPageId: "host", itemId: "child", kind: "page" }),
      failure,
    );
  } finally {
    queryClient.clear();
  }
});
