import type { PageActionOps } from "@zilobase/features/runtime";
import type { ServerOperationContext } from "../operations/context";
import { createPageOperation } from "../pages/hierarchy/operations";
import { updatePageOperation } from "../pages/content/operations";
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
  | { op: "page.favorite"; pageId: string; favorite: boolean };

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

  async function run<T>(request: PageRequest, inverse: ActionChange["inverse"]) {
    const key = {
      invocationId: options.invocationId,
      callId: options.callId,
      opIndex: sequence.next(),
    };
    const stored = await receipts.get(key);
    const replayed = (stored?.request as PageRequest | undefined) ?? request;
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
    return (result as { page: T }).page;
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
    setPageFavorite: ({ pageId, favorite }) =>
      run(
        { op: "page.favorite", pageId, favorite },
        { op: "page.favorite", input: { pageId, favorite: !favorite } },
      ),
  };
}
