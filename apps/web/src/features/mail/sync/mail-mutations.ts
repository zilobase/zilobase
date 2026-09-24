import type {
  MailModifyRequest,
  MailThreadMutationResponse,
  MailMessageMutationResponse,
} from "@zilobase/features/mail/contracts";
import { ApiError } from "@/platform/network/api";
import {
  optimisticallyModifyThread,
  optimisticallyModifyMessage,
  restoreMailMutation,
  queueMailReconciliation,
  upsertFullMailThread,
  reconcileMailMessage,
  type MailDatabase,
  type MailMutationSnapshot,
} from "../storage/mail-database";

export function isDefiniteMailMutationFailure(error: unknown) {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}

export async function runMailThreadMutation(input: {
  database: MailDatabase;
  threadId: string;
  modification: MailModifyRequest;
  request: () => Promise<MailThreadMutationResponse>;
}) {
  let snapshot: MailMutationSnapshot | null = null;
  try {
    if (await input.database.threads.get(input.threadId))
      snapshot = await optimisticallyModifyThread(
        input.database,
        input.threadId,
        input.modification,
      );
    await upsertFullMailThread(input.database, await input.request());
  } catch (error) {
    if (snapshot && isDefiniteMailMutationFailure(error))
      await restoreMailMutation(input.database, snapshot);
    await queueMailReconciliation(input.database, {
      threadIds: [input.threadId],
    });
    throw error;
  }
}

export async function runMailMessageMutation(input: {
  database: MailDatabase;
  messageId: string;
  modification: MailModifyRequest;
  request: () => Promise<MailMessageMutationResponse>;
}) {
  let snapshot: MailMutationSnapshot | null = null;
  try {
    snapshot = await optimisticallyModifyMessage(
      input.database,
      input.messageId,
      input.modification,
    );
    const response = await input.request();
    await reconcileMailMessage(input.database, response.message);
  } catch (error) {
    if (snapshot && isDefiniteMailMutationFailure(error))
      await restoreMailMutation(input.database, snapshot);
    await queueMailReconciliation(input.database, {
      messageIds: [input.messageId],
    });
    throw error;
  }
}
