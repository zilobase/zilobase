import { hasAccess } from "../../access/access-level";
import {
  canAccessPageInWorkspace,
  getEffectiveTeamspaceAccessInWorkspace,
} from "../../access/effective-access";
import { getMembership } from "../../access/principal-access";
import { getPageRecord as getPage } from "../../access/resource-access-records";
import {
  requireOperationActor,
  requireOperationPolicy,
  requireOperationWorkspace,
  ServerOperationError,
  type ServerOperationContext,
} from "../../operations/context";
import {
  convertPageToTeamspace,
  createHierarchicalPage,
  embedPageItem,
  movePageToTeamspace,
  unembedPageItem,
} from "../../pages/hierarchy/page-hierarchy";
import { TeamspaceManagementService } from "../../teamspaces/management";
import { requireActivePageWorkspace, requirePageOperationWorkspace } from "../access";

/** `requestedPageId` is a trusted service argument; HTTP routes never pass it. */
export type CreatePageInput = { body: unknown; requestedPageId?: string };
export async function createPageOperation(
  context: ServerOperationContext,
  input: CreatePageInput,
  readBody?: () => Promise<unknown>,
) {
  requireOperationPolicy(context, { write: true, oauthScope: "pages.write" });

  const user = requireOperationActor(context);
  const body = readBody ? await readBody() : input.body;
  if (!body || typeof body !== "object") return deny({ error: "A JSON body is required" }, 400);

  const {
    workspaceId,
    type = "pageblock",
    name = "",
    url = "#",
    content = null,
    metadata = null,
    parentItemId = null,
    teamspaceId = null,
  } = body as {
    workspaceId?: unknown;
    type?: unknown;
    name?: unknown;
    url?: unknown;
    content?: unknown;
    metadata?: unknown;
    parentItemId?: unknown;
    teamspaceId?: unknown;
  };

  if (typeof workspaceId !== "string" || workspaceId.length === 0) {
    return deny({ error: "workspaceId is required" }, 400);
  }

  requireOperationWorkspace(context, workspaceId);

  if (typeof name !== "string") {
    return deny({ error: "name must be a string" }, 400);
  }

  if (typeof type !== "string" || typeof url !== "string") {
    return deny({ error: "type and url must be strings" }, 400);
  }

  if (parentItemId === null && !(await getMembership(workspaceId, user.id))) {
    return deny({ error: "Forbidden" }, 403);
  }

  await requireActivePageWorkspace(context, workspaceId, user.id);

  if (parentItemId !== null && typeof parentItemId !== "string") {
    return deny({ error: "parentItemId must be a string or null" }, 400);
  }

  if (teamspaceId !== null && typeof teamspaceId !== "string") {
    return deny({ error: "teamspaceId must be a string or null" }, 400);
  }

  if (
    typeof parentItemId === "string" &&
    !(await canAccessPageInWorkspace(parentItemId, workspaceId, user.id, "edit"))
  ) {
    return deny({ error: "Forbidden" }, 403);
  }

  if (input.requestedPageId) {
    const existing = await getPage(input.requestedPageId);
    if (existing) {
      if (existing.workspaceId !== workspaceId || existing.createdById !== user.id)
        return deny({ error: "Page ID is already in use" }, 409);
      // A redelivered create returns the page it already made.
      return { navDelta: { upsertPlacements: [], upsertPages: [existing] }, page: existing };
    }
  }

  return await createHierarchicalPage(
    {
      workspaceId,
      type,
      name,
      url,
      content,
      metadata,
      parentItemId,
      teamspaceId,
      requestedPageId: input.requestedPageId,
    },
    user,
  );
}

export type MoveToTeamspacePageInput = { pageId: string; body: unknown };
export async function moveToTeamspacePageOperation(
  context: ServerOperationContext,
  input: MoveToTeamspacePageInput,
  readBody?: () => Promise<unknown>,
) {
  requireOperationPolicy(context, { write: true, oauthScope: "pages.write" });
  await requirePageOperationWorkspace(context, input.pageId);

  const user = requireOperationActor(context);
  if (!user) return deny({ error: "Unauthorized" }, 401);

  const body = readBody ? await readBody() : input.body;
  const destinationId =
    body && typeof body === "object" ? (body as { teamspaceId?: unknown }).teamspaceId : undefined;
  if (destinationId !== null && typeof destinationId !== "string") {
    return deny({ error: "teamspaceId must be a string or null" }, 400);
  }

  const record = await getPage(input.pageId);
  if (!record) return deny({ error: "Page not found" }, 404);
  if (!(await canAccessPageInWorkspace(record.id, record.workspaceId, user.id, "full"))) {
    return deny({ error: "Forbidden" }, 403);
  }
  if (
    destinationId &&
    !hasAccess(
      await getEffectiveTeamspaceAccessInWorkspace(destinationId, record.workspaceId, user.id),
      "edit",
    )
  ) {
    return deny({ error: "Forbidden" }, 403);
  }
  if (!destinationId && !(await getMembership(record.workspaceId, user.id))) {
    return deny({ error: "Forbidden" }, 403);
  }

  return await movePageToTeamspace(record, destinationId);
}

export type ConvertToTeamspacePageInput = { pageId: string; body: unknown };
export async function convertToTeamspacePageOperation(
  context: ServerOperationContext,
  input: ConvertToTeamspacePageInput,
  readBody?: () => Promise<unknown>,
) {
  requireOperationPolicy(context, { write: true, oauthScope: "pages.write" });
  await requirePageOperationWorkspace(context, input.pageId);

  const user = requireOperationActor(context);
  if (!user) return deny({ error: "Unauthorized" }, 401);
  const record = await getPage(input.pageId);
  if (!record) return deny({ error: "Page not found" }, 404);
  if (record.teamspaceId) {
    return deny({ error: "This page is already in a teamspace." }, 409);
  }
  if (!(await canAccessPageInWorkspace(record.id, record.workspaceId, user.id, "full"))) {
    return deny({ error: "Forbidden" }, 403);
  }
  const body = (readBody ? await readBody() : input.body) ?? {};
  const accessMode =
    body &&
    typeof body === "object" &&
    ["open", "closed", "private"].includes(String((body as { accessMode?: unknown }).accessMode))
      ? (body as { accessMode: "open" | "closed" | "private" }).accessMode
      : "closed";
  const requestedName =
    body && typeof body === "object" && typeof (body as { name?: unknown }).name === "string"
      ? (body as { name: string }).name.trim()
      : "";
  const service = new TeamspaceManagementService(
    undefined,
    context.editionExtension ?? undefined,
    context.env,
  );
  try {
    return await convertPageToTeamspace(service, record, user, accessMode, requestedName);
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return deny({ error: error.message }, (error as { status: 400 | 403 | 404 | 409 }).status);
    }
    throw error;
  }
}

export type EmbedPageInput = { pageId: string; body: unknown };
export async function embedPageOperation(
  context: ServerOperationContext,
  input: EmbedPageInput,
  readBody?: () => Promise<unknown>,
) {
  requireOperationPolicy(context, { write: true, oauthScope: "pages.write" });
  await requirePageOperationWorkspace(context, input.pageId);

  const user = requireOperationActor(context);

  if (!user) {
    return deny({ error: "Unauthorized" }, 401);
  }

  const hostId = input.pageId;
  const body = readBody ? await readBody() : input.body;

  if (!body || typeof body !== "object") {
    return deny({ error: "A JSON body is required" }, 400);
  }

  const { itemId, kind } = body as {
    itemId?: unknown;
    kind?: unknown;
  };

  if (typeof itemId !== "string" || itemId.length === 0) {
    return deny({ error: "itemId is required" }, 400);
  }

  if (kind !== "page" && kind !== "database") {
    return deny({ error: "kind must be page or database" }, 400);
  }

  const host = await getPage(hostId);

  if (!host) {
    return deny({ error: "Page not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(host.id, host.workspaceId, user.id, "edit"))) {
    return deny({ error: "Forbidden" }, 403);
  }

  await requireActivePageWorkspace(context, host.workspaceId, user.id);

  return await embedPageItem(host, user, itemId, kind);
}

export type RemoveEmbedPageInput = { pageId: string; body: unknown };
export async function removeEmbedPageOperation(
  context: ServerOperationContext,
  input: RemoveEmbedPageInput,
  readBody?: () => Promise<unknown>,
) {
  requireOperationPolicy(context, { write: true, oauthScope: "pages.write" });
  await requirePageOperationWorkspace(context, input.pageId);

  const user = requireOperationActor(context);

  if (!user) {
    return deny({ error: "Unauthorized" }, 401);
  }

  const hostId = input.pageId;
  const body = readBody ? await readBody() : input.body;

  if (!body || typeof body !== "object") {
    return deny({ error: "A JSON body is required" }, 400);
  }

  const { itemId, kind, placementId } = body as {
    itemId?: unknown;
    kind?: unknown;
    placementId?: unknown;
  };

  if (typeof itemId !== "string" || itemId.length === 0) {
    return deny({ error: "itemId is required" }, 400);
  }

  if (kind !== "page" && kind !== "database") {
    return deny({ error: "kind must be page or database" }, 400);
  }

  const host = await getPage(hostId);

  if (!host) {
    return deny({ error: "Page not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(host.id, host.workspaceId, user.id, "edit"))) {
    return deny({ error: "Forbidden" }, 403);
  }

  await requireActivePageWorkspace(context, host.workspaceId, user.id);

  return await unembedPageItem(host, itemId, kind, placementId);
}

function deny(body: Record<string, unknown>, status: number): never {
  throw new ServerOperationError(body, status);
}
