import assert from "node:assert/strict";
import test from "node:test";
import { createMutationTestRuntime } from "../shared/mutation-runtime.test";
import { useSetPagePublished } from "./access-mutations";
import { pageAccessQueryKey, pageQueryKey } from "./queries";

for (const isPublished of [true, false]) {
  test(`publication ${isPublished ? "grants" : "revokes"} public access and invalidates detail and access`, async () => {
    const requests: Array<{ url: string; method?: string; body?: unknown }> = [];
    const { mutation, queryClient } = createMutationTestRuntime(useSetPagePublished, async <T>(url: string, init?: RequestInit) => {
      requests.push({ url, method: init?.method, body: init?.body });
      return { access: [] } as T;
    });
    queryClient.setQueryData(pageQueryKey("p"), { page: { id: "p" } });
    queryClient.setQueryData(pageAccessQueryKey("p"), { access: [] });
    try {
      await mutation.mutateAsync({ pageId: "p", isPublished });
      assert.equal(requests[0]?.url, isPublished ? "/pages/p/access" : "/pages/p/access/public");
      assert.equal(requests[0]?.method, isPublished ? "PUT" : "DELETE");
      if (isPublished) assert.deepEqual(JSON.parse(String(requests[0]?.body)), { accessLevel: "view", targetId: "*", targetType: "public" });
      assert.equal(queryClient.getQueryState(pageQueryKey("p"))?.isInvalidated, true);
      assert.equal(queryClient.getQueryState(pageAccessQueryKey("p"))?.isInvalidated, true);
    } finally { queryClient.clear(); }
  });
}
