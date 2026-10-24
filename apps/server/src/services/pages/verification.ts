import { z } from "zod";
import { sql } from "drizzle-orm";
import { deriveContentVerification } from "@zilobase/features/search";
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
  return db.transaction((tx) =>
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
      if (!write) return { verification: verificationFromRow(record), canManage };
      const result = (
        await tx.execute<VerificationRow>(
          sql`update ${table} set verified_at=${input.action === "verify" ? sql`clock_timestamp()` : sql`null`}, verified_by_id=${input.action === "verify" ? actor.id : null}, verification_expires_at=${expiry?.toISOString() ?? null}::timestamptz,verification_updated_at=greatest(clock_timestamp(),coalesce(verification_updated_at, '-infinity'::timestamptz)+interval '1 millisecond') where id=${input.id} returning workspace_id,verified_at,verified_by_id,verification_expires_at,verification_updated_at`,
        )
      ).rows[0]!;
      return { verification: verificationFromRow(result), canManage };
    }),
  );
}
