import { apiFetch } from "@/platform/network/api";

import {
  queueMailReconciliation,
  type MailDatabase,
  type MailMutationOutboxRecord,
} from "../storage/mail-database";
import { isDefiniteMailMutationFailure } from "./mail-mutations";

const activeDrains = new Map<string, Promise<void>>();

export function drainMailMutationOutbox(database: MailDatabase, mailBasePath: string) {
  const existing = activeDrains.get(database.name);
  if (existing) return existing;
  const run = drain(database, mailBasePath).finally(() => activeDrains.delete(database.name));
  activeDrains.set(database.name, run);
  return run;
}

async function drain(database: MailDatabase, mailBasePath: string) {
  for (let count = 0; count < 50; count += 1) {
    const now = Date.now();
    const operation = await database.mutationOutbox
      .orderBy("createdAt")
      .filter((row) => row.nextAttemptAt <= now)
      .first();
    if (!operation) return;
    try {
      await apiFetch(operationPath(mailBasePath, operation), {
        body: JSON.stringify(
          operation.action ? { action: operation.action } : operation.modification,
        ),
        headers: { "Idempotency-Key": operation.id },
        method: "POST",
      });
      await database.mutationOutbox.delete(operation.id);
    } catch (error) {
      if (isDefiniteMailMutationFailure(error)) {
        await database.mutationOutbox.delete(operation.id);
        await queueMailReconciliation(database, {
          messageIds: operation.kind.startsWith("message_") ? [operation.targetId] : [],
          threadIds: operation.kind.startsWith("thread_") ? [operation.targetId] : [],
        });
        continue;
      }
      const attempts = operation.attempts + 1;
      const ceiling = Math.min(15 * 60_000, 1_000 * 2 ** Math.min(attempts, 10));
      await database.mutationOutbox.update(operation.id, {
        attempts,
        nextAttemptAt: Date.now() + Math.max(1_000, Math.floor(Math.random() * ceiling)),
      });
      return;
    }
  }
}

function operationPath(base: string, operation: MailMutationOutboxRecord) {
  const target = operation.kind.startsWith("thread_") ? "threads" : "messages";
  const action = operation.kind.endsWith("_action") ? "action" : "modify";
  return `${base}/${target}/${encodeURIComponent(operation.targetId)}/${action}`;
}
