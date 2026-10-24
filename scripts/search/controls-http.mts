import assert from "node:assert/strict";
export async function checkControlsHttp({ request, query, workspace }) {
  const actor = (
    await query(
      "select u.id,u.name,u.email from \"user\" u join member m on m.user_id=u.id where m.workspace_id=$1 and m.role='owner'",
      [workspace],
    )
  ).rows[0];
  const root = (
    await request("/pages", "POST", { workspaceId: workspace, name: "Controls root" }, 201)
  ).page.id;
  const child = (
    await request(
      "/pages",
      "POST",
      {
        workspaceId: workspace,
        name: "Controls child",
        parentItemId: root,
        content: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "controlbodysecret" }] }],
        },
      },
      201,
    )
  ).page.id;
  const search = (body, status = 200) =>
    request("/search", "POST", { workspaceId: workspace, ...body }, status);
  try {
    const scoped = await search({
      query: "child",
      filters: { pageIds: [root], createdByUserIds: ["me"] },
      sort: "title_asc",
      limit: 1,
    });
    assert.equal(scoped.type, "workspace_search");
    assert.equal(scoped.results.length, 1);
    assert.equal(scoped.results[0].id, child);
    assert.equal(scoped.exhaustive, false);
    assert.equal(
      (await search({ query: "controlbodysecret", filters: { titleOnly: true } })).results.length,
      0,
    );
    assert.equal((await search({ query: "controlbodysecret" })).results[0].id, child);
    assert.equal((await search({ queryType: "user", query: actor.email })).users[0].id, actor.id);
    await search({}, 400);
    await search({ query: "controls", limit: 51 }, 400);
    await search({ queryType: "user", query: "Ada", filters: { titleOnly: true } }, 400);
    const before = (await query("select updated_at,last_edited_at from page where id=$1", [child]))
      .rows[0];
    const verified = await request(`/pages/${child}/verification`, "PUT", { expiresAt: null });
    assert.equal(verified.verification.state, "verified");
    const after = (await query("select updated_at,last_edited_at from page where id=$1", [child]))
      .rows[0];
    assert.deepEqual(after, before, "verification has a separate clock");
    await request(`/pages/${child}`, "PATCH", { name: "Controls renamed child" });
    assert.equal((await request(`/pages/${child}/verification`)).verification.state, "verified");
    const found = await search({
      filters: { contentStatus: ["verified"], editedByUserIds: ["me"] },
      sort: "last_edited_desc",
    });
    assert.equal(found.results[0].id, child);
    assert.equal(found.results[0].lastEditedById, actor.id);
    assert.equal(found.results[0].verification.state, "verified");
    await request(`/pages/${child}/verification`, "DELETE");
    assert.equal((await request(`/pages/${child}/verification`)).verification.state, "unverified");
    const beforeBody = (
      await query("select last_edited_at from page where id=$1", [child])
    ).rows[0].last_edited_at.toISOString();
    // A debounced body update must retain the authenticated direct editor on both runtimes.
    await request(`/pages/${child}/content`, "PATCH", {
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "replacement controls body" }] },
        ],
      },
    });
    let edited;
    for (let attempt = 0; attempt < 200; attempt++) {
      edited = (
        await query(
          "select last_edited_by_id,last_edited_at,content::text like '%replacement controls body%' as changed from page where id=$1",
          [child],
        )
      ).rows[0];
      if (edited.changed && edited.last_edited_at.toISOString() !== beforeBody) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(edited.changed, true);
    assert.notEqual(edited.last_edited_at.toISOString(), beforeBody);
    assert.equal(edited.last_edited_by_id, actor.id);
  } finally {
    await request(`/pages/${child}`, "DELETE");
    await request(`/pages/${root}`, "DELETE");
  }
}
