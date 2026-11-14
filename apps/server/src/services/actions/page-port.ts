import type { PageActionOps } from "@zilobase/features/runtime";
import type { ServerOperationContext } from "../operations/context";
import { createPageOperation } from "../pages/hierarchy/operations";
import { appendPageCommentOperation } from "../pages/content/comment-operation";
import { updatePageOperation } from "../pages/content/operations";
import { restorePageOperation } from "../pages/lifecycle/operations";
import { favoritePageOperation, unfavoritePageOperation } from "../pages/navigation/operations";
import { actionSequence, type ActionChange, type ActionSequence } from "./database-port";
import { deterministicActionId, type ActionReceiptStore } from "./receipts";

export type PagePortOptions = {
  context: ServerOperationContext;
  invocationId: string;
  callId: string;
  receipts: ActionReceiptStore;
  sequence?: ActionSequence;
  onChange?: (change: ActionChange) => void;
};

type PageRequest =
  | { op: "page.create"; pageId: string; body: Record<string, unknown> }
  | { op: "page.update"; pageId: string; body: Record<string, unknown> }
  | { op: "page.favorite"; pageId: string; favorite: boolean }
  | { op: "page.comment"; pageId: string; body: string; threadId: string; messageId: string }
  | { op: "page.restore"; pageId: string };

/**
 * Runs page operations for workspace actions through the services the page
 * routes call, with the acting user's authorization. Requests are stored
 * before execution and results after, so redelivered calls replay; page
 * creation uses reserved IDs, so a create interrupted before its receipt
 * completes returns the page it already made.
 */
export function createPageActionPort(options: PagePortOptions): PageActionOps {
  const sequence = options.sequence ?? actionSequence();
  const { context, receipts } = options;

  async function run<T>(
    request: PageRequest | ((opIndex: number) => Promise<PageRequest>),
    inverse: ActionChange["inverse"],
    pick: (result: unknown) => T = (result) => (result as { page: T }).page,
  ) {
    const key = {
      invocationId: options.invocationId,
      callId: options.callId,
      opIndex: sequence.next(),
    };
    const stored = await receipts.get(key);
    const replayed =
      (stored?.request as PageRequest | undefined) ??
      (typeof request === "function" ? await request(key.opIndex) : request);
    let result: unknown;
    if (stored?.status === "completed") result = stored.result;
    else {
      if (!stored) await receipts.savePending(key, { kind: "page", request: replayed });
      result = await execute(replayed);
      await receipts.complete(key, result);
    }
    options.onChange?.({
      callId: options.callId,
      opIndex: key.opIndex,
      kind: "page",
      commandType: replayed.op,
      databaseId: null,
      dataSourceId: null,
      pageId: replayed.pageId,
      ack: { commandId: `${key.opIndex}`, event: null, result, sourceVersions: {} } as never,
      inverse,
    });
    return pick(result);
  }

  function execute(request: PageRequest): Promise<unknown> {
    switch (request.op) {
      case "page.create":
        return createPageOperation(context, {
          body: request.body,
          requestedPageId: request.pageId,
        });
      case "page.update":
        return updatePageOperation(context, { pageId: request.pageId, body: request.body });
      case "page.favorite":
        return (request.favorite ? favoritePageOperation : unfavoritePageOperation)(context, {
          pageId: request.pageId,
        });
      case "page.comment":
        return appendPageCommentOperation(context, {
          pageId: request.pageId,
          body: request.body,
          threadId: request.threadId,
          messageId: request.messageId,
        });
      case "page.restore":
        return restorePageOperation(context, { pageId: request.pageId });
    }
  }

  return {
    reserveIds: async ({ refs }) =>
      Object.fromEntries(
        await Promise.all(
          refs.map(async (ref) => [
            ref,
            await deterministicActionId(options.invocationId, options.callId, `id:${ref}`),
          ]),
        ),
      ),
    createPage: ({ pageId, parentPageId, ...input }) =>
      run(
        {
          op: "page.create",
          pageId,
          body: {
            ...input,
            type: "pageblock",
            url: "#",
            metadata: input.metadata ?? {},
            parentItemId: parentPageId ?? null,
            teamspaceId: input.teamspaceId ?? null,
          },
        },
        { op: "page.delete", input: { pageId } },
      ),
    updatePage: ({ pageId, ...patch }) => run({ op: "page.update", pageId, body: patch }, null),
    addPageComment: ({ pageId, body }) =>
      run(
        async (opIndex) => ({
          op: "page.comment",
          pageId,
          body,
          threadId: await deterministicActionId(
            options.invocationId,
            options.callId,
            `thread:${opIndex}`,
          ),
          messageId: await deterministicActionId(
            options.invocationId,
            options.callId,
            `message:${opIndex}`,
          ),
        }),
        null,
        (result) => result as { threadId: string; messageId: string },
      ),
    restorePage: ({ pageId }) =>
      run({ op: "page.restore", pageId }, { op: "page.delete", input: { pageId } }),
    setPageFavorite: ({ pageId, favorite }) =>
      run(
        { op: "page.favorite", pageId, favorite },
        { op: "page.favorite", input: { pageId, favorite: !favorite } },
      ),
  };
}
