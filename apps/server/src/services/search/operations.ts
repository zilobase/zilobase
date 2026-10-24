import {
  workspaceSearchHttpRequestSchema,
  type WorkspaceSearchFilters,
  type WorkspaceSearchSort,
} from "@zilobase/features/search";
import { searchWorkspaceUsersOperation } from "./users";
import { getMembership } from "../access/principal-access";
import {
  requireOperationPolicy,
  requireOperationWorkspace,
  ServerOperationError,
  type ServerOperationContext,
} from "../operations/context";
import { semanticSearchWorkspace } from "./retrieval";
import type { SearchPurpose } from "./vector-contracts";
import { searchWorkspaceItems } from "./workspace-search";
const maxSearchResults = 50;
export type SearchWorkspaceOperationInput = {
  workspaceId?: string;
  types?: string;
  q?: string;
  mode?: string;
  purpose?: SearchPurpose;
  filters?: WorkspaceSearchFilters;
  sort?: WorkspaceSearchSort;
  limit?: number;
};
export async function searchWorkspaceOperation(
  context: ServerOperationContext,
  operationInput: SearchWorkspaceOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: "search.read" });

  const user = context.authentication.user;
  if (!user) {
    return deny({ error: "Unauthorized" }, 401);
  }
  const workspaceId = operationInput.workspaceId;
  if (!workspaceId) {
    return deny({ error: "workspaceId is required" }, 400);
  }
  requireOperationWorkspace(context, workspaceId);

  if (!(await getMembership(workspaceId, user.id))) {
    return deny({ error: "Forbidden" }, 403);
  }
  const requestedTypes = (operationInput.types ?? "")
    .split(",")
    .filter((type): type is "database" | "page" => type === "database" || type === "page");
  if (
    operationInput.mode !== undefined &&
    operationInput.mode !== "keyword" &&
    operationInput.mode !== "semantic"
  )
    return deny({ error: "Invalid search mode" }, 400);
  if (operationInput.mode === "semantic" && (operationInput.q ?? "").length > 512)
    return deny({ error: "Semantic search is limited to 512 characters" }, 400);
  if (
    operationInput.mode === "semantic" &&
    (operationInput.filters !== undefined || operationInput.sort !== undefined)
  )
    return deny({ error: "Structured controls require keyword search" }, 400);
  const input = {
    limit: Math.min(maxSearchResults, Math.max(1, operationInput.limit ?? maxSearchResults)),
    ...(operationInput.filters ? { filters: operationInput.filters } : {}),
    ...(operationInput.sort ? { sort: operationInput.sort } : {}),
    membershipVerified: true,
    query: operationInput.q ?? "",
    types: requestedTypes.length ? requestedTypes : undefined,
    userId: user.id,
    workspaceId,
  };
  if (operationInput.mode === "semantic")
    return semanticSearchWorkspace(input, context.env, { purpose: operationInput.purpose });
  const results = await searchWorkspaceItems(input);
  return {
    results,
  };
}

function deny(body: Record<string, unknown>, status: number): never {
  throw new ServerOperationError(body, status);
}

/** Typed search surface; GET retains its existing empty-query picker behavior. */
export async function structuredWorkspaceSearchOperation(
  context: ServerOperationContext,
  body: unknown,
) {
  if (!context.authentication.user) return deny({ error: "Unauthorized" }, 401);
  const parsed = workspaceSearchHttpRequestSchema.safeParse(body);
  if (!parsed.success)
    return deny({ error: "Invalid search request", details: parsed.error.issues }, 400);
  const { workspaceId, ...request } = parsed.data;
  if (request.queryType === "user")
    return searchWorkspaceUsersOperation(context, { workspaceId, request });
  const result = await searchWorkspaceOperation(context, {
    workspaceId,
    q: request.query,
    types: request.types.join(","),
    filters: request.filters,
    sort: request.sort,
    limit: request.limit,
  });
  return { type: "workspace_search" as const, results: result.results, exhaustive: false as const };
}
