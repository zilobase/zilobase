import { expect, test, vi } from "vitest";
import type { ServerOperationContext } from "../operations/context";
import { actionSequence, type ActionChange } from "./database-port";
import { createPageActionPort } from "./page-port";
import { deterministicActionId, memoryReceiptStore } from "./receipts";

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), favorite: vi.fn() }));
vi.mock("../pages/hierarchy/operations", () => ({ createPageOperation: mocks.create }));
vi.mock("../pages/content/operations", () => ({ updatePageOperation: mocks.update }));
vi.mock("../pages/navigation/operations", () => ({
  favoritePageOperation: mocks.favorite,
  unfavoritePageOperation: vi.fn(),
}));

const context = {} as ServerOperationContext;

test("page creates use reserved IDs, the route body shape, and replay from receipts", async () => {
  mocks.create.mockImplementation(async (_, input) => ({
    page: { id: input.requestedPageId, name: input.body.name },
    navDelta: {},
  }));
  const receipts = memoryReceiptStore();
  const changes: ActionChange[] = [];
  const port = () =>
    createPageActionPort({
      context,
      invocationId: "run-1",
      callId: "call-1",
      receipts,
      sequence: actionSequence(),
      onChange: (change) => changes.push(change),
    });
  const ids = await port().reserveIds({ refs: ["page"] });
  expect(ids.page).toBe(await deterministicActionId("run-1", "call-1", "id:page"));
  const create = {
    pageId: ids.page!,
    workspaceId: "org",
    name: "Launch",
    metadata: { emoji: "🚀" },
    parentPageId: "parent",
    content: { type: "doc", content: [] },
  };
  const page = await port().createPage(create);
  expect(page).toEqual({ id: ids.page, name: "Launch" });
  expect(mocks.create).toHaveBeenCalledWith(context, {
    requestedPageId: ids.page,
    body: {
      workspaceId: "org",
      name: "Launch",
      metadata: { emoji: "🚀" },
      content: { type: "doc", content: [] },
      type: "pageblock",
      url: "#",
      parentItemId: "parent",
      teamspaceId: null,
    },
  });
  // A redelivered call replays the stored result instead of creating again.
  await port().createPage(create);
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(
    changes.map(({ kind, commandType, pageId, inverse }) => [kind, commandType, pageId, inverse]),
  ).toEqual([
    ["page", "page.create", ids.page, { op: "page.delete", input: { pageId: ids.page } }],
    ["page", "page.create", ids.page, { op: "page.delete", input: { pageId: ids.page } }],
  ]);
});

test("favorites record their toggle as the inverse", async () => {
  mocks.favorite.mockResolvedValue({ page: { id: "p", isFavorite: true } });
  const changes: ActionChange[] = [];
  await createPageActionPort({
    context,
    invocationId: "run",
    callId: "call",
    receipts: memoryReceiptStore(),
    onChange: (change) => changes.push(change),
  }).setPageFavorite({ pageId: "p", favorite: true });
  expect(mocks.favorite).toHaveBeenCalledWith(context, { pageId: "p" });
  expect(changes[0]!.inverse).toEqual({
    op: "page.favorite",
    input: { pageId: "p", favorite: false },
  });
});
