import { and, eq } from "drizzle-orm";
import { db } from "../../infrastructure/database";
import { workspaceActionReceipt } from "../../infrastructure/database/schema";
import { getMembership } from "../access/principal-access";
import {
  requireOperationActor,
  requireOperationPolicy,
  requireOperationWorkspace,
  ServerOperationError,
  type ServerOperationContext,
} from "../operations/context";
import { executeWorkspaceAction, personalScopes } from "./execute";
import { databaseReceiptStore, recordActionChanges } from "./stores";

/** Proposals use a reserved operation position next to the call's own receipts. */
const PROPOSAL_OP_INDEX = -1;

type Proposal = { name: string; input: unknown; workspaceId: string; userId: string };

/**
 * Records a destructive action the model proposed. Nothing runs until the
 * user confirms it in the chat; the model cannot confirm its own proposal.
 */
export async function proposeWorkspaceAction(
  key: { invocationId: string; callId: string },
  proposal: Proposal,
) {
  await db
    .insert(workspaceActionReceipt)
    .values({
      ...key,
      opIndex: PROPOSAL_OP_INDEX,
      kind: "proposal",
      request: proposal,
      status: "proposed",
    })
    .onConflictDoNothing();
}

/** The user's Confirm or Cancel for a proposed action; a decision is made once. */
export async function decideWorkspaceAction(
  context: ServerOperationContext,
  input: {
    workspaceId: string;
    invocationId: string;
    callId: string;
    decision: "confirm" | "cancel";
  },
  dependencies = { execute: executeWorkspaceAction },
) {
  requireOperationPolicy(context, { write: true });
  const user = requireOperationActor(context);
  requireOperationWorkspace(context, input.workspaceId);
  if (!(await getMembership(input.workspaceId, user.id)))
    throw new ServerOperationError({ error: "Forbidden" }, 403);

  const key = and(
    eq(workspaceActionReceipt.invocationId, input.invocationId),
    eq(workspaceActionReceipt.callId, input.callId),
    eq(workspaceActionReceipt.opIndex, PROPOSAL_OP_INDEX),
  );
  const [row] = await db.select().from(workspaceActionReceipt).where(key).limit(1);
  const proposal = row?.request as Proposal | undefined;
  if (!row || row.kind !== "proposal" || !proposal)
    throw new ServerOperationError({ error: "Nothing is waiting for confirmation" }, 404);
  if (proposal.userId !== user.id || proposal.workspaceId !== input.workspaceId)
    throw new ServerOperationError({ error: "Forbidden" }, 403);

  // Claim the decision atomically so concurrent clicks cannot both run it.
  const [claimed] = await db
    .update(workspaceActionReceipt)
    .set({
      status: input.decision === "confirm" ? "confirmed" : "cancelled",
      completedAt: new Date(),
    })
    .where(and(key, eq(workspaceActionReceipt.status, "proposed")))
    .returning();
  if (!claimed)
    throw new ServerOperationError({ error: `This action was already ${row.status}.` }, 409);
  if (input.decision === "cancel") return { status: "cancelled" as const, changes: [] };

  const outcome = await dependencies.execute({
    context,
    principal: {
      kind: "user",
      userId: user.id,
      workspaceId: input.workspaceId,
      scopes: personalScopes,
    },
    invocationId: input.invocationId,
    callId: input.callId,
    name: proposal.name,
    input: proposal.input,
    receipts: databaseReceiptStore,
  });
  await recordActionChanges({
    invocationId: input.invocationId,
    workspaceId: input.workspaceId,
    userId: user.id,
    changes: outcome.changes,
  });
  const changes = outcome.changes.map(({ commandType, databaseId, pageId, ack }) => ({
    command: commandType,
    databaseId,
    ...(pageId ? { pageId } : {}),
    id: (ack.result as { id?: string } | null)?.id,
  }));
  if (outcome.status !== "completed")
    throw new ServerOperationError({ error: outcome.message, changes }, 409);
  return { status: "completed" as const, changes };
}
