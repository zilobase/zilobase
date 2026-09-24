import type { MailComposeSeed } from "./mail-compose";
import type { MailDatabase } from "../storage/mail-database";

export async function saveMailComposeRecovery(
  database: MailDatabase,
  clientOperationId: string,
  seed: MailComposeSeed,
) {
  await database.composeRecovery.put({
    id: clientOperationId,
    updatedAt: Date.now(),
    value: JSON.stringify({ ...seed, clientOperationId }),
  });
}

export async function deleteMailComposeRecovery(database: MailDatabase, clientOperationId: string) {
  await database.composeRecovery.delete(clientOperationId);
}

export async function loadLatestMailComposeRecovery(database: MailDatabase) {
  const record = await database.composeRecovery.orderBy("updatedAt").last();
  if (!record) return null;
  try {
    return JSON.parse(record.value) as MailComposeSeed;
  } catch {
    await database.composeRecovery.delete(record.id);
    return null;
  }
}
