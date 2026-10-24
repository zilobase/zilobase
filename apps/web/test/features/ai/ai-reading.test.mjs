export function register({ loadModule, assert, test }) {
  test("search activity stays separate from reads and never inherits a citation source", async () => {
    const { groupSourceReads } = await loadModule(
      "/src/sections/ai/chat/components/read-activity.tsx",
      ["groupSourceReads"],
    );
    const groups = groupSourceReads({
      context: { manifest: [{ type: "page", id: "page" }] },
      progress: {
        activities: [
          { id: "search-1", name: "search_workspace", query: "launch", status: "completed" },
          {
            id: "search-2",
            name: "semantic_search_workspace",
            query: "roadmap",
            status: "completed",
          },
          {
            id: "read",
            name: "read_page",
            status: "completed",
            source: { type: "page", id: "page" },
          },
        ],
      },
    });
    assert.equal(groups.length, 3);
    assert.equal(groups[0].source, undefined);
    assert.equal(groups[1].source, undefined);
    assert.equal(groups[2].source.id, "page");
  });
  test("reading groups pagination by source and preserves distinct pages and tools", async () => {
    const { groupSourceReads } = await loadModule(
      "/src/sections/ai/chat/components/read-activity.tsx",
      ["groupSourceReads"],
    );
    const call = (id, pageId, hasMore) => ({
      id,
      name: "read_page",
      label: "Reading page",
      status: "completed",
      source: { type: "page", id: pageId },
      hasMore,
      returned: 10,
    });
    const first = call("first", "page", true);
    const second = call("second", "page", false);
    const groups = groupSourceReads({
      progress: {
        activities: [
          first,
          second,
          second,
          call("linked", "linked-page", false),
          { ...call("outline", "page", false), name: "describe_source" },
        ],
      },
    });
    assert.equal(groups.length, 3);
    assert.equal(groups[0].calls.length, 2);
    assert.equal(groups[0].calls.at(-1).hasMore, false);
    assert.equal(groups[1].source.id, "linked-page");
  });

  test("old runs resolve a single known page and never assign ambiguous page names", async () => {
    const { groupSourceReads } = await loadModule(
      "/src/sections/ai/chat/components/read-activity.tsx",
      ["groupSourceReads"],
    );
    const activity = { id: "old", name: "read_page", status: "completed", label: "Reading page" };
    const message = {
      context: { manifest: [{ type: "page", id: "page" }] },
      progress: { activities: [activity, { ...activity, id: "old-next" }] },
    };
    assert.equal(groupSourceReads(message).length, 1);
    message.context.manifest.push({ type: "page", id: "linked" });
    assert.equal(groupSourceReads(message).length, 2);
    assert.equal(groupSourceReads(message)[0].source, undefined);
  });
}
