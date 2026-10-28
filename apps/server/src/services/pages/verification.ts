import { z } from "zod";
import { sql } from "drizzle-orm";
import { deriveContentVerification } from "@zilobase/features/search";
import {
  commitDatabaseMutationBatch,
  type DatabaseTransaction,
} from "../databases/mutations/commit";
import { db, runWithDb } from "../../infrastructure/database";
import { canAccessDatabaseInWorkspace, canAccessPageInWorkspace } from "../access/effective-access";
import {
  requireOperationActor,
  requireOperationPolicy,
  requireOperationWorkspace,
  ServerOperationError,
  type ServerOperationContext,
} from "../operations/context";

export const verificationInputSchema = z
  .object({ expiresAt: z.iso.datetime({ offset: true }).nullable() })
  .strict();
type VerificationRow = {
  workspace_id: string;
  verified_at: Date | null;
  verified_by_id: string | null;
  verification_expires_at: Date | null;
  verification_updated_at: Date | null;
};
export function verificationFromRow(row: VerificationRow) {
  return deriveContentVerification({
    verifiedAt: row.verified_at,
    verifiedById: row.verified_by_id,
    verificationExpiresAt: row.verification_expires_at,
    verificationUpdatedAt: row.verification_updated_at,
  });
}
/** Verification has its own clock and never changes the document revision or editor. */
export async function contentVerificationOperation(
  context: ServerOperationContext,
  input: {
    type: "page" | "database";
    id: string;
    action: "read" | "verify" | "remove";
    body?: unknown;
  },
) {
  const write = input.action !== "read";
  requireOperationPolicy(context, {
    write,
    oauthScope: `${input.type === "page" ? "pages" : "databases"}.${write ? "write" : "read"}`,
  });
  const actor = requireOperationActor(context);
  const parsed =
    input.action === "verify" ? verificationInputSchema.safeParse(input.body) : undefined;
  if (parsed && !parsed.success)
    throw new ServerOperationError(
      { error: "Invalid verification", details: parsed.error.issues },
      400,
    );
  const expiry = parsed?.success && parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (expiry && expiry.getTime() <= Date.now())
    throw new ServerOperationError({ error: "Verification expiry must be in the future" }, 400);
  const table = sql.identifier(input.type);
  const operation = (tx: DatabaseTransaction) =>
    runWithDb(tx, async () => {
      const record = (
        await tx.execute<VerificationRow>(
          sql`select workspace_id,verified_at,verified_by_id,verification_expires_at,verification_updated_at from ${table} where id=${input.id} and deleted_at is null for update`,
        )
      ).rows[0];
      if (!record) throw new ServerOperationError({ error: "Content unavailable" }, 404);
      requireOperationWorkspace(context, record.workspace_id);
      const canAccess =
        input.type === "page" ? canAccessPageInWorkspace : canAccessDatabaseInWorkspace;
      if (!(await canAccess(input.id, record.workspace_id, actor.id, "view")))
        throw new ServerOperationError({ error: "Content unavailable" }, 404);
      const canManage = await canAccess(input.id, record.workspace_id, actor.id, "edit");
      if (write && !canManage) throw new ServerOperationError({ error: "Forbidden" }, 403);
      if (expiry && expiry.getTime() <= Date.now())
        throw new ServerOperationError({ error: "Verification expiry must be in the future" }, 400);
      if (!write)
        return {
          workspaceId: record.workspace_id,
          type: input.type,
          id: input.id,
          verification: verificationFromRow(record),
          canManage,
        };
      const result = (
        await tx.execute<VerificationRow>(
          sql`update ${table} set verified_at=${input.action === "verify" ? sql`clock_timestamp()` : sql`null`}, verified_by_id=${input.action === "verify" ? actor.id : null}, verification_expires_at=${expiry?.toISOString() ?? null}::timestamptz,verification_updated_at=greatest(clock_timestamp(),coalesce(verification_updated_at, '-infinity'::timestamptz)+interval '1 millisecond') where id=${input.id} returning workspace_id,verified_at,verified_by_id,verification_expires_at,verification_updated_at`,
        )
      ).rows[0]!;
      return {
        workspaceId: result.workspace_id,
        type: input.type,
        id: input.id,
        verification: verificationFromRow(result),
        canManage,
      };
    });
  if (!write) return db.transaction(operation);
  const { result } = await commitDatabaseMutationBatch(
    { actorId: actor.id, env: context.env },
    async (tx) => {
      const result = await operation(tx);
      if (input.type !== "page") return { result, mutations: [] };
      // A page can appear through several linked sources. Advance each source
      // and notify every container in the same transaction as its trust change.
      const sources = (
        await tx.execute<{ id: string; parent_database_id: string }>(sql`
        update data_source set version=version+1
        where id in (select data_source_id from database_row where page_id=${input.id} and deleted_at is null)
        returning id,parent_database_id
      `)
      ).rows;
      const mutations = [];
      for (const source of sources) {
        const links = (
          await tx.execute<{ database_id: string }>(sql`
          select database_id from database_data_source where data_source_id=${source.id}
        `)
        ).rows;
        for (const databaseId of new Set([
          source.parent_database_id,
          ...links.map((link) => link.database_id),
        ])) {
          mutations.push({
            databaseId,
            dataSourceId: source.id,
            areas: ["records" as const],
            changes: {},
            requiresReset: true as const,
          });
        }
      }
      return { result, mutations };
    },
  );
  return result;
}
