import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../../infrastructure/database";
import { aiMcpConnection, aiMcpToolSnapshot } from "../../../../infrastructure/database/schema";

const grantSchema = z.object({
  classification: z.enum(["read", "write", "unknown"]),
  connectionId: z.string(),
  externalName: z.string(),
  requiresApproval: z.boolean(),
  schemaHash: z.string(),
});
const snapshotSchema = z.object({ mcpTools: z.array(grantSchema) });

export async function captureAgentMcpToolGrants(profileId: string, workspaceId: string) {
  const rows = await db.select({
    classification: aiMcpToolSnapshot.classification,
    connectionId: aiMcpConnection.id,
    externalName: aiMcpToolSnapshot.externalName,
    schemaHash: aiMcpToolSnapshot.schemaHash,
    executionMode: aiMcpToolSnapshot.executionMode,
    alwaysAllow: aiMcpConnection.alwaysAllowEnabled,
  }).from(aiMcpToolSnapshot).innerJoin(aiMcpConnection,
    eq(aiMcpConnection.id, aiMcpToolSnapshot.connectionId),
  ).where(and(
    eq(aiMcpConnection.workspaceId, workspaceId),
    eq(aiMcpConnection.agentProfileId, profileId),
    eq(aiMcpConnection.scopeType, "agent"),
    eq(aiMcpConnection.state, "connected"),
    eq(aiMcpToolSnapshot.enabled, true),
    eq(aiMcpToolSnapshot.available, true),
  ));
  return rows.map(({ executionMode, alwaysAllow, ...identity }) => ({
    ...identity,
    requiresApproval: executionMode === "always_ask" && !alwaysAllow,
  }));
}

/** Missing or malformed snapshots fail closed. Live permission checks still apply. */
export function findAgentMcpToolGrant(
  permissionSnapshot: unknown,
  identity: { connectionId: string; externalName: string; schemaHash: string; classification: string },
) {
  const parsed = snapshotSchema.safeParse(permissionSnapshot);
  if (!parsed.success) return undefined;
  return parsed.data.mcpTools.find((grant) =>
    grant.connectionId === identity.connectionId &&
    grant.externalName === identity.externalName &&
    grant.schemaHash === identity.schemaHash &&
    grant.classification === identity.classification,
  );
}
