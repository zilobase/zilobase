import type { ToolSet } from "ai";
import { and, eq, gt } from "drizzle-orm";
import { db } from "../../../infrastructure/database";
import { aiAgentRun } from "../../../infrastructure/database/schema";

export const AGENT_RUN_LEASE_MS = 60_000;

/** A bounded, renewable lease shared by Node and queue consumers. */
export function maintainAgentRunLease(runId: string, workerId: string) {
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5 * 60_000)]);
  let pending: Promise<void> | undefined;
  const renew = async () => {
    signal.throwIfAborted();
    const now = new Date();
    const [run] = await db
      .update(aiAgentRun)
      .set({
        leaseExpiresAt: new Date(now.getTime() + AGENT_RUN_LEASE_MS),
      })
      .where(
        and(
          eq(aiAgentRun.id, runId),
          eq(aiAgentRun.leaseOwner, workerId),
          eq(aiAgentRun.status, "running"),
          gt(aiAgentRun.leaseExpiresAt, now),
        ),
      )
      .returning({ id: aiAgentRun.id });
    if (!run) throw new Error("Agent run lease is no longer active.");
    signal.throwIfAborted();
  };
  const timer = setInterval(() => {
    if (pending) return;
    pending = renew()
      .catch((error: unknown) => controller.abort(error))
      .finally(() => {
        pending = undefined;
      });
  }, AGENT_RUN_LEASE_MS / 3);

  return {
    signal,
    guardTools(tools: ToolSet): ToolSet {
      return Object.fromEntries(
        Object.entries(tools).map(([name, definition]) => {
          const execute = definition.execute;
          if (!execute) return [name, definition];
          return [
            name,
            {
              ...definition,
              execute: async (...args: Parameters<typeof execute>) => {
                await renew();
                return execute(...args);
              },
            },
          ];
        }),
      );
    },
    async stop() {
      clearInterval(timer);
      await pending;
    },
  };
}
