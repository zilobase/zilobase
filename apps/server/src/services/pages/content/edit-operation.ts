import type { PageEdit } from "@zilobase/page-context";
import { editPageContent } from "../../collaboration/mutations/document-mutations";
import { requireOperationPolicy, type ServerOperationContext } from "../../operations/context";
import { authorizePageOperation, requirePageOperationWorkspace } from "../access";

/** Edits an existing page's live content as the acting user. `editId` makes retries no-ops. */
export async function editPageContentOperation(
  context: ServerOperationContext,
  input: { pageId: string; edits: PageEdit[]; editId: string },
) {
  requireOperationPolicy(context, { write: true, oauthScope: "pages.write" });
  await requirePageOperationWorkspace(context, input.pageId);
  const { user } = await authorizePageOperation(context, input.pageId, "edit");
  return editPageContent({ ...input, userId: user.id });
}
