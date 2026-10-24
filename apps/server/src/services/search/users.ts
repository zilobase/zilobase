import { sql } from "drizzle-orm";
import { workspaceSearchRequestSchema, type SearchUser } from "@zilobase/features/search";
import { db } from "../../infrastructure/database";
import { getMembership } from "../access/principal-access";
import {
  requireOperationActor,
  requireOperationPolicy,
  requireOperationWorkspace,
  ServerOperationError,
  type ServerOperationContext,
} from "../operations/context";
import { withSearchRead } from "./eligibility";

export async function searchWorkspaceUsersOperation(
  context: ServerOperationContext,
  input: { workspaceId: string; request: unknown },
) {
  requireOperationPolicy(context, { write: false, oauthScope: "users.read" });
  const actor = requireOperationActor(context);
  requireOperationWorkspace(context, input.workspaceId);
  const parsed = workspaceSearchRequestSchema.safeParse(input.request);
  if (!parsed.success)
    throw new ServerOperationError(
      { error: "Invalid user lookup", details: parsed.error.issues },
      400,
    );
  const request = parsed.data;
  if (request.queryType !== "user")
    throw new ServerOperationError({ error: "Expected user lookup" }, 400);
  return withSearchRead(async () => {
    if (!(await getMembership(input.workspaceId, actor.id)))
      throw new ServerOperationError({ error: "Forbidden" }, 403);
    const w = input.workspaceId,
      query = request.query.toLowerCase();
    // Directory privileges are checked in the query too, before ranking/limiting.
    const users = (
      await db.execute<SearchUser>(sql`with actor as materialized(
      select role from member where workspace_id=${w} and user_id=${actor.id} and (role<>'temporary' or access_expires_at>clock_timestamp())
    ), visible_users as (
      select user_id from member where workspace_id=${w} and (role<>'temporary' or access_expires_at>clock_timestamp()) and exists(select 1 from actor)
      union select user_id from workspace_guest where workspace_id=${w} and exists(select 1 from actor where role in ('owner','admin'))
    ) select u.id,u.name,u.email from "user" u where u.id in(select user_id from visible_users) and (strpos(lower(u.name),${query})>0 or strpos(lower(u.email),${query})>0)
    order by case when lower(u.email)=${query} then 0 when lower(u.name)=${query} then 1 else 2 end,lower(u.name),lower(u.email),u.id limit ${request.limit}`)
    ).rows;
    return { type: "user_search" as const, users, exhaustive: false as const };
  });
}
