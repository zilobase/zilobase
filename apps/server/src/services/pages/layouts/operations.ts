import { z } from "zod";
import { parseUnknown } from "../../../shared/validation";
import {
  requireOperationActor,
  requireOperationPolicy,
  ServerOperationError,
  type ServerOperationContext,
} from "../../operations/context";
import {
  canEditScope,
  canViewTarget,
  deletePageLayout,
  getTargetContext,
  resolvePageLayouts,
  resolveScopeContext,
  savePageLayout,
} from "./page-layouts";
const PageLayoutScopeSchema = z.enum(["workspace", "database", "page"]);
const SavePageLayout = z.object({
  clearPageOverrides: z.boolean().optional(),
  config: z.unknown(),
});

export async function resolvePageLayoutOperation(
  context: ServerOperationContext,
  input: { pageId?: string | null; databaseId?: string | null },
) {
  requireOperationPolicy(context, { write: false });
  const target = await getTargetContext({
    pageId: input.pageId?.trim() || null,
    databaseId: input.databaseId?.trim() || null,
  });
  if (!target) throw new ServerOperationError({ error: "Page or database not found." }, 404);
  if (!(await canViewTarget(target, context.authentication.user?.id)))
    throw new ServerOperationError({ error: "Forbidden" }, 403);
  return resolvePageLayouts(target);
}
export async function savePageLayoutOperation(
  context: ServerOperationContext,
  input: { scope: unknown; scopeId: string; body: unknown },
  readBody?: () => Promise<unknown>,
) {
  requireOperationPolicy(context, { write: true });
  const user = requireOperationActor(context);
  const scopeResult = await parseUnknown(PageLayoutScopeSchema, input.scope);
  const bodyResult = await parseUnknown(SavePageLayout, readBody ? await readBody() : input.body);
  if (!scopeResult.ok || !bodyResult.ok)
    throw new ServerOperationError({ error: "Invalid layout." }, 400);
  const scope = scopeResult.data;
  const target = await resolveScopeContext(scope, input.scopeId);
  if (!target) throw new ServerOperationError({ error: "Layout target not found." }, 404);
  if (!(await canEditScope(scope, input.scopeId, target.workspaceId, user.id)))
    throw new ServerOperationError({ error: "Forbidden" }, 403);
  return savePageLayout(scope, input.scopeId, target, bodyResult.data);
}
export async function resetPageLayoutOperation(
  context: ServerOperationContext,
  input: { scope: unknown; scopeId: string },
) {
  requireOperationPolicy(context, { write: true });
  const user = requireOperationActor(context);
  const scopeResult = await parseUnknown(PageLayoutScopeSchema, input.scope);
  if (!scopeResult.ok) throw new ServerOperationError({ error: "Invalid scope." }, 400);
  const scope = scopeResult.data;
  const target = await resolveScopeContext(scope, input.scopeId);
  if (!target) throw new ServerOperationError({ error: "Layout target not found." }, 404);
  if (!(await canEditScope(scope, input.scopeId, target.workspaceId, user.id)))
    throw new ServerOperationError({ error: "Forbidden" }, 403);
  await deletePageLayout(scope, input.scopeId);
  return { ok: true };
}
