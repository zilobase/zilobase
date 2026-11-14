import assert from "node:assert/strict";
import test from "node:test";

import { isPlanRejection, runPlan } from "../../actions/plan";
import { findWorkspaceAction } from "../../actions/registry";
import { planCreatePageTree } from "./catalog";

function harness() {
  const calls: Array<{ op: string; input: Record<string, unknown> }> = [];
  const record =
    (op: string, result: (input: Record<string, unknown>) => unknown) =>
    async (input: Record<string, unknown>) => {
      calls.push({ op, input });
      return result(input);
    };
  const ops = {
    reserveIds: record("reserveIds", (input) =>
      Object.fromEntries((input.refs as string[]).map((ref) => [ref, `id-${ref}`])),
    ),
    createPage: record("createPage", (input) => ({ id: input.pageId, name: input.name })),
    createDatabase: record("createDatabase", (input) => ({
      database: { id: input.databaseId },
      activeDataSource: { id: `source-${input.databaseId}`, config: {} },
      navDelta: {},
    })),
    applyDataSourceTemplate: record("applyDataSourceTemplate", () => ({})),
  };
  return { calls, ops: ops as never };
}

test("a page tree reserves IDs and places subpages and databases where the Markdown names them", async () => {
  const plan = planCreatePageTree(
    { workspaceId: "org" },
    {
      title: "Launch",
      icon: "🚀",
      content: "# Plan\n\n[Database: Tasks]\n\nNotes",
      subpages: [{ title: "Risks", content: "- Scope" }, { title: "Retro" }],
      databases: [
        { name: "Tasks", properties: [{ name: "Status", type: "status" }] },
        { name: "Budget" },
      ],
    },
  );
  assert.ok(!isPlanRejection(plan));
  const { calls, ops } = harness();
  const run = await runPlan(plan, ops, { sequential: true });
  assert.equal(run.status, "completed");
  assert.deepEqual(
    calls.map(({ op }) => op),
    [
      "reserveIds",
      "createPage",
      "createPage",
      "createPage",
      "createDatabase",
      "applyDataSourceTemplate",
      "createDatabase",
      "applyDataSourceTemplate",
    ],
  );
  const root = calls[1]!.input;
  assert.equal(root.pageId, "id-page");
  assert.deepEqual(root.metadata, { emoji: "🚀" });
  const blocks = (
    root.content as { content: Array<{ type: string; attrs?: Record<string, unknown> }> }
  ).content;
  assert.deepEqual(
    blocks.map(({ type, attrs }) => [type, attrs?.databaseId ?? attrs?.pageId ?? null]),
    [
      ["heading", null],
      ["databaseBlock", "id-database:0"],
      ["paragraph", null],
      ["paragraph", null],
      ["pageBlock", "id-subpage:0"],
      ["pageBlock", "id-subpage:1"],
      ["databaseBlock", "id-database:1"],
      ["paragraph", null],
    ],
  );
  assert.deepEqual(
    calls.slice(2, 4).map(({ input }) => [input.pageId, input.parentPageId, input.name]),
    [
      ["id-subpage:0", "id-page", "Risks"],
      ["id-subpage:1", "id-page", "Retro"],
    ],
  );
  assert.deepEqual(calls[4]!.input, {
    databaseId: "id-database:0",
    workspaceId: "org",
    name: "Tasks",
    pageId: "id-page",
    standalone: false,
  });
  assert.equal(run.results.get<{ id: string }>("page").id, "id-page");
});

test("page actions are registered for milestone B with strict inputs", () => {
  const create = findWorkspaceAction("pages.create");
  assert.equal(create?.milestone, "B");
  assert.equal(create?.kind, "write");
  assert.equal(create?.input.safeParse({ title: "x", unknown: 1 }).success, false);
  assert.equal(findWorkspaceAction("pages.update")?.input.safeParse({ pageId: "p" }).success, true);
});
