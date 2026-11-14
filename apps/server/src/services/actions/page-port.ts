import type { PageActionOps } from "@zilobase/features/runtime";
import { assignBlockIds } from "@zilobase/page-context";
import type { ServerOperationContext } from "../operations/context";
import { getPageRecord } from "../access/resource-access-records";
import { createPageOperation, embedPageOperation } from "../pages/hierarchy/operations";
import { appendPageCommentOperation } from "../pages/content/comment-operation";
import { editPageContentOperation } from "../pages/content/edit-operation";
import { updatePageOperation } from "../pages/content/operations";
import { deletePageOperation, restorePageOperation } from "../pages/lifecycle/operations";
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
  | {
      op: "page.update";
      pageId: string;
      body: Record<string, unknown>;
      /** Captured before the update and stored with the request, so replays keep it. */
      previous?: { name: string; metadata: Record<string, unknown> | null };
    }
  | { op: "page.favorite"; pageId: string; favorite: boolean }
  | { op: "page.comment"; pageId: string; body: string; threadId: string; messageId: string }
  | { op: "page.restore"; pageId: string }
  | { op: "page.delete"; pageId: string }
  | { op: "page.edit"; pageId: string; edits: unknown[]; editId: string }
  | { op: "page.embed"; pageId: string; itemId: string; kind: "page" | "database" };

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
    inverse:
      | ActionChange["inverse"]
      | ((result: unknown, request: PageRequest) => ActionChange["inverse"]),
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
      inverse: typeof inverse === "function" ? inverse(result, replayed) : inverse,
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
      case "page.delete":
        return deletePageOperation(context, { pageId: request.pageId });
      case "page.embed":
        return embedPageOperation(context, {
          pageId: request.pageId,
          body: { itemId: request.itemId, kind: request.kind },
        });
      case "page.edit":
        return editPageContentOperation(context, {
          pageId: request.pageId,
          edits: request.edits as never,
          editId: request.editId,
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
            content: withBlockIds(input.content),
            type: "pageblock",
            url: "#",
            metadata: input.metadata ?? {},
            parentItemId: parentPageId ?? null,
            teamspaceId: input.teamspaceId ?? null,
          },
        },
        { op: "page.delete", input: { pageId } },
      ),
    updatePage: ({ pageId, ...patch }) =>
      run(
        async () => {
          const page = await getPageRecord(pageId);
          return {
            op: "page.update",
            pageId,
            body: patch,
            ...(page
              ? { previous: { name: page.name, metadata: (page.metadata ?? null) as never } }
              : {}),
          };
        },
        (_, request) => {
          const previous = request.op === "page.update" ? request.previous : undefined;
          if (!previous) return null;
          const emoji = (previous.metadata as { emoji?: unknown } | null)?.emoji ?? null;
          return {
            op: "page.update",
            input: { pageId, name: previous.name, metadata: { ...previous.metadata, emoji } },
          };
        },
      ),
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
    editPageContent: ({ pageId, edits }) =>
      run(
        async (opIndex) => ({
          op: "page.edit",
          pageId,
          edits,
          editId: await deterministicActionId(
            options.invocationId,
            options.callId,
            `edit:${opIndex}`,
          ),
        }),
        (result) => {
          const edit = result as { status: string; inverse?: unknown[] };
          return edit.status === "applied" && edit.inverse
            ? { op: "page.edit", input: { pageId, edits: edit.inverse } }
            : null;
        },
        (result) => result as { status: "applied" | "replayed"; blocks: number },
      ),
    embedItem: ({ hostPageId, itemId, kind }) =>
      run(
        { op: "page.embed", pageId: hostPageId, itemId, kind },
        { op: "page.unembed", input: { pageId: hostPageId, itemId, kind } },
        (result) => {
          const { action, placementId } = result as { action: string; placementId: string | null };
          return { action, placementId };
        },
      ),
    deletePage: ({ pageId }) =>
      run(
        { op: "page.delete", pageId },
        { op: "page.restore", input: { pageId } },
        (result) => result,
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

/** AI-created pages start with block IDs, so they don't wait for the editor to add them. */
function withBlockIds(content: unknown) {
  const document = content as { type?: string; content?: unknown[] } | null;
  return document?.type === "doc" && Array.isArray(document.content)
    ? {
        ...document,
        content: assignBlockIds(document.content as never[], () => crypto.randomUUID()),
      }
    : content;
}
