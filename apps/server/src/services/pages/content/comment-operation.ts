import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";
import { appendPageComment } from "../../collaboration/mutations/document-mutations";
import { requireOperationPolicy, type ServerOperationContext } from "../../operations/context";
import { authorizePageOperation, requirePageOperationWorkspace } from "../access";

export async function appendPageCommentOperation(
  context: ServerOperationContext,
  /** `threadId`/`messageId` are trusted service arguments; routes never pass them. */
  input: { pageId: string; body: string; threadId?: string; messageId?: string },
) {
  requireOperationPolicy(context, { write: true, oauthScope: "pages.write" });
  await requirePageOperationWorkspace(context, input.pageId);
  const { user } = await authorizePageOperation(context, input.pageId, "comment");
  if (typeof input.body !== "string") throw new ServiceMutationError("body must be a string", 400);
  return appendPageComment({
    pageId: input.pageId,
    body: input.body,
    env: context.env,
    threadId: input.threadId,
    messageId: input.messageId,
    author: { id: user.id, email: user.email, image: user.image ?? null, name: user.name },
  });
}
