import Dexie, { type EntityTable } from "dexie";
import type {
  MailLabelRecord,
  MailMessageRecord,
  MailModifyRequest,
  MailThreadSummary,
  MailView,
} from "@zilobase/features/mail";

const MAIL_DATABASE_VERSION = 7;
const openDatabases = new Map<string, MailDatabase>();
const MAIL_LIFECYCLE_CHANNEL = "zilobase:mail-cache-lifecycle:v2";
let lifecycleChannel: BroadcastChannel | null = null;

export type MailSyncStateRecord = {
  bindingId: string;
  connectionId: string;
  key: "primary";
  lastSyncedAt: number | null;
  revision: number;
  pendingMessageReconciliationIds?: string[];
  pendingThreadReconciliationIds?: string[];
  schemaVersion: number;
  userId: string;
  workspaceId: string;
};

export type MailMutationOutboxRecord = {
  action?: "restore" | "trash";
  attempts: number;
  createdAt: number;
  id: string;
  kind: "message_action" | "message_modify" | "thread_action" | "thread_modify";
  modification: MailModifyRequest;
  nextAttemptAt: number;
  targetId: string;
};

export type MailComposeRecoveryRecord = {
  id: string;
  updatedAt: number;
  value: string;
};

export class MailDatabase extends Dexie {
  composeRecovery!: EntityTable<MailComposeRecoveryRecord, "id">;
  labels!: EntityTable<MailLabelRecord, "id">;
  messages!: EntityTable<MailMessageRecord, "id">;
  mutationOutbox!: EntityTable<MailMutationOutboxRecord, "id">;
  syncState!: EntityTable<MailSyncStateRecord, "key">;
  threads!: EntityTable<MailThreadSummary, "id">;

  constructor(
    name: string,
    readonly identity: {
      bindingId: string;
      connectionId: string;
      userId: string;
      workspaceId: string;
    },
  ) {
    super(name);
    this.version(MAIL_DATABASE_VERSION)
      .stores({
        composeRecovery: "id, updatedAt",
        labels: "id, name, type",
        messages: "id, threadId, draftId, date, internalDate, *labelIds, [threadId+internalDate]",
        mutationOutbox: "id, [kind+targetId], createdAt, nextAttemptAt",
        syncState: "key, bindingId, connectionId, userId, workspaceId",
        threads: "id, internalDate, latestMessageId, unread, starred, *labelIds",
      })
      .upgrade((transaction) =>
        transaction.table("syncState").toCollection().modify({
          revision: 0,
          schemaVersion: MAIL_DATABASE_VERSION,
        }),
      );
  }
}

export type MailDatabaseIdentity = {
  apiOrigin: string;
  bindingId: string;
  connectionId: string;
  userId: string;
  workspaceId: string;
};

export function mailDatabaseName(input: MailDatabaseIdentity) {
  const origin = new URL(input.apiOrigin).origin;
  const userId = requireIdentifier(input.userId, "user");
  const workspaceId = requireIdentifier(input.workspaceId, "workspace");
  const bindingId = requireIdentifier(input.bindingId, "binding");
  return `zilobase:v2:${encodeURIComponent(origin)}:${encodeURIComponent(userId)}:workspace:${encodeURIComponent(workspaceId)}:mail:${encodeURIComponent(bindingId)}`;
}

export async function openMailDatabase(
  input: MailDatabaseIdentity,
  recoveryAttempt = false,
): Promise<MailDatabase> {
  const name = mailDatabaseName(input);
  const bindingId = input.bindingId;
  const workspaceId = input.workspaceId;
  try {
    initializeLifecycleChannel();
    let database = openDatabases.get(name);
    if (!database) {
      database = new MailDatabase(name, {
        bindingId,
        connectionId: input.connectionId,
        userId: input.userId,
        workspaceId,
      });
      openDatabases.set(name, database);
    }

    await database.open();
    const state = await database.syncState.get("primary");
    if (
      state &&
      (state.schemaVersion !== MAIL_DATABASE_VERSION ||
        state.connectionId !== input.connectionId ||
        state.bindingId !== bindingId ||
        state.userId !== input.userId ||
        state.workspaceId !== workspaceId)
    )
      throw new MailCacheError("The mail cache schema is incompatible.", "schema_incompatible");

    if (!state) {
      await database.syncState.put({
        bindingId,
        connectionId: input.connectionId,
        key: "primary",
        lastSyncedAt: null,
        revision: 0,
        schemaVersion: MAIL_DATABASE_VERSION,
        userId: input.userId,
        workspaceId,
      });
    }
    await destroyOtherConnectionDatabases(input, name);
    return database;
  } catch (error) {
    closeMailDatabase(name);
    if (recoveryAttempt || !isRecoverableMailCacheError(error)) throw error;
    await destroyMailDatabase(name);
    return openMailDatabase(input, true);
  }
}

export async function applyMailboxSnapshot(
  database: MailDatabase,
  response: {
    deletedMessageIds?: string[];
    deletedThreadIds?: string[];
    labels?: MailLabelRecord[];
    messages?: MailMessageRecord[];
    threads?: MailThreadSummary[];
    resetRequired?: boolean;
    toRevision?: number;
  },
) {
  await database.transaction(
    "rw",
    database.labels,
    database.messages,
    database.syncState,
    database.threads,
    async () => {
      if (response.labels?.length) await database.labels.bulkPut(response.labels);
      if (response.resetRequired) {
        await database.labels.clear();
        await database.messages.clear();
        await database.threads.clear();
        if (response.labels?.length) await database.labels.bulkPut(response.labels);
      }
      if (response.messages?.length) await mergeMessages(database, response.messages);
      if (response.threads?.length) await database.threads.bulkPut(response.threads);
      if (response.deletedMessageIds?.length) {
        await database.messages.bulkDelete(response.deletedMessageIds);
      }
      if (response.deletedThreadIds?.length) {
        await database.threads.bulkDelete(response.deletedThreadIds);
      }
      const state = await database.syncState.get("primary");
      if (!state) throw new Error("Mail cache identity is missing.");
      await database.syncState.put({
        ...state,
        lastSyncedAt: Date.now(),
        revision: response.toRevision ?? state.revision ?? 0,
      });
    },
  );
}

export async function enqueueMailMutation(
  database: MailDatabase,
  input: Omit<MailMutationOutboxRecord, "attempts" | "createdAt" | "id" | "nextAttemptAt">,
) {
  const now = Date.now();
  const existing = input.kind.endsWith("_modify")
    ? await database.mutationOutbox
        .where("[kind+targetId]")
        .equals([input.kind, input.targetId])
        .first()
    : null;
  if (existing) {
    const add = new Set(existing.modification.addLabelIds ?? []);
    const remove = new Set(existing.modification.removeLabelIds ?? []);
    for (const label of input.modification.addLabelIds ?? []) {
      remove.delete(label);
      add.add(label);
    }
    for (const label of input.modification.removeLabelIds ?? []) {
      add.delete(label);
      remove.add(label);
    }
    await database.mutationOutbox.put({
      ...existing,
      modification: { addLabelIds: [...add], removeLabelIds: [...remove] },
      nextAttemptAt: now,
    });
    return existing.id;
  }
  const id = crypto.randomUUID();
  await database.mutationOutbox.put({
    ...input,
    attempts: 0,
    createdAt: now,
    id,
    nextAttemptAt: now,
  });
  return id;
}

export function mailThreadMatchesView(thread: MailThreadSummary, view: MailView) {
  switch (view) {
    case "all_mail":
      return !["SPAM", "TRASH"].some((label) => thread.labelIds.includes(label));
    case "archive":
      return !["INBOX", "SENT", "DRAFT", "SPAM", "TRASH"].some((label) =>
        thread.labelIds.includes(label),
      );
    case "bin":
      return thread.labelIds.includes("TRASH");
    case "drafts":
      return thread.labelIds.includes("DRAFT");
    case "inbox":
      return thread.labelIds.includes("INBOX");
    case "sent":
      return thread.labelIds.includes("SENT");
    case "spam":
      return thread.labelIds.includes("SPAM");
    case "starred":
      return thread.starred;
    case "trash":
      return thread.labelIds.includes("TRASH");
    case "unread":
      return thread.unread;
  }
}

export async function upsertFullMailThread(
  database: MailDatabase,
  input: { messages: MailMessageRecord[]; thread: MailThreadSummary },
) {
  await database.transaction("rw", database.messages, database.threads, async () => {
    const known = await database.messages.where("threadId").equals(input.thread.id).primaryKeys();
    const authoritative = new Set(
      input.thread.messageIds ?? input.messages.map((message) => message.id),
    );
    await database.messages.bulkDelete(known.filter((id) => !authoritative.has(String(id))));
    await mergeMessages(database, input.messages);
    await database.threads.put(input.thread);
  });
}

export type MailMutationSnapshot = {
  messages: MailMessageRecord[];
  thread: MailThreadSummary;
};

export async function optimisticallyModifyThread(
  database: MailDatabase,
  threadId: string,
  modification: MailModifyRequest,
) {
  return database.transaction("rw", database.messages, database.threads, async () => {
    const thread = await database.threads.get(threadId);
    if (!thread) throw new Error("The cached Gmail thread is unavailable.");
    const messages = await database.messages.where("threadId").equals(threadId).toArray();
    await database.messages.bulkPut(
      messages.map((message) => ({
        ...message,
        labelIds: modifyLabelIds(message.labelIds, modification),
      })),
    );
    await database.threads.put(updateThreadLabels(thread, modification));
    return { messages, thread } satisfies MailMutationSnapshot;
  });
}

export async function optimisticallyModifyMessage(
  database: MailDatabase,
  messageId: string,
  modification: MailModifyRequest,
) {
  return database.transaction("rw", database.messages, database.threads, async () => {
    const message = await database.messages.get(messageId);
    if (!message) throw new Error("The cached Gmail message is unavailable.");
    const thread = await database.threads.get(message.threadId);
    if (!thread) throw new Error("The cached Gmail thread is unavailable.");
    const messages = await database.messages.where("threadId").equals(message.threadId).toArray();
    const updatedMessages = messages.map((item) =>
      item.id === messageId
        ? { ...item, labelIds: modifyLabelIds(item.labelIds, modification) }
        : item,
    );
    await database.messages.bulkPut(updatedMessages);
    await database.threads.put(recalculateThreadLabels(thread, updatedMessages));
    return { messages, thread } satisfies MailMutationSnapshot;
  });
}

export async function restoreMailMutation(database: MailDatabase, snapshot: MailMutationSnapshot) {
  await database.transaction("rw", database.messages, database.threads, async () => {
    await database.messages.bulkPut(snapshot.messages);
    await database.threads.put(snapshot.thread);
  });
}

export async function reconcileMailMessage(database: MailDatabase, message: MailMessageRecord) {
  await database.transaction("rw", database.messages, database.threads, async () => {
    await mergeMessages(database, [message]);
    const thread = await database.threads.get(message.threadId);
    if (!thread) return;
    const messages = await database.messages.where("threadId").equals(message.threadId).toArray();
    await database.threads.put(recalculateThreadLabels(thread, messages));
  });
}

export async function deleteMailLabelFromCache(database: MailDatabase, labelId: string) {
  await database.transaction(
    "rw",
    database.labels,
    database.messages,
    database.threads,
    async () => {
      await database.labels.delete(labelId);
      await database.messages
        .where("labelIds")
        .equals(labelId)
        .modify((message) => {
          message.labelIds = message.labelIds.filter((id) => id !== labelId);
        });
      await database.threads
        .where("labelIds")
        .equals(labelId)
        .modify((thread) => {
          thread.labelIds = thread.labelIds.filter((id) => id !== labelId);
        });
    },
  );
}

export async function deleteMailThreadFromCache(database: MailDatabase, threadId: string) {
  await database.transaction("rw", database.messages, database.threads, async () => {
    await database.messages.where("threadId").equals(threadId).delete();
    await database.threads.delete(threadId);
  });
}

export async function deleteMailMessageFromCache(database: MailDatabase, messageId: string) {
  await database.transaction("rw", database.messages, database.threads, async () => {
    const message = await database.messages.get(messageId);
    if (!message) return;
    await database.messages.delete(messageId);
    const thread = await database.threads.get(message.threadId);
    if (!thread) return;
    const messages = await database.messages.where("threadId").equals(message.threadId).toArray();
    if (!messages.length) await database.threads.delete(message.threadId);
    else await database.threads.put(recalculateThreadLabels(thread, messages));
  });
}

export async function queueMailReconciliation(
  database: MailDatabase,
  input: { messageIds?: string[]; threadIds?: string[] },
) {
  await database.transaction("rw", database.syncState, async () => {
    const state = await database.syncState.get("primary");
    if (!state) throw new Error("Mail cache identity is missing.");
    await database.syncState.put({
      ...state,
      pendingMessageReconciliationIds: uniqueLimited([
        ...(state.pendingMessageReconciliationIds ?? []),
        ...(input.messageIds ?? []),
      ]),
      pendingThreadReconciliationIds: uniqueLimited([
        ...(state.pendingThreadReconciliationIds ?? []),
        ...(input.threadIds ?? []),
      ]),
    });
  });
}

export async function clearMailReconciliation(
  database: MailDatabase,
  input: { messageId?: string; threadId?: string },
) {
  await database.transaction("rw", database.syncState, async () => {
    const state = await database.syncState.get("primary");
    if (!state) return;
    await database.syncState.put({
      ...state,
      pendingMessageReconciliationIds: state.pendingMessageReconciliationIds?.filter(
        (id) => id !== input.messageId,
      ),
      pendingThreadReconciliationIds: state.pendingThreadReconciliationIds?.filter(
        (id) => id !== input.threadId,
      ),
    });
  });
}

async function mergeMessages(database: MailDatabase, messages: MailMessageRecord[]) {
  const existing = await database.messages.bulkGet(messages.map((message) => message.id));
  await database.messages.bulkPut(
    messages.map((message, index) => {
      const cached = existing[index];
      if (
        !cached?.hasFullBody ||
        message.hasFullBody ||
        (message.labelIds.includes("DRAFT") && cached.historyId !== message.historyId)
      )
        return message;
      return {
        ...message,
        attachments: cached.attachments,
        attachmentCount: cached.attachmentCount,
        bodyHtml: cached.bodyHtml,
        bodyText: cached.bodyText,
        hasFullBody: true,
      };
    }),
  );
}

function modifyLabelIds(labelIds: string[], modification: MailModifyRequest) {
  const next = new Set(labelIds);
  for (const id of modification.removeLabelIds ?? []) next.delete(id);
  for (const id of modification.addLabelIds ?? []) next.add(id);
  return [...next];
}

function updateThreadLabels(thread: MailThreadSummary, modification: MailModifyRequest) {
  const labelIds = modifyLabelIds(thread.labelIds, modification);
  return {
    ...thread,
    labelIds,
    starred: labelIds.includes("STARRED"),
    unread: labelIds.includes("UNREAD"),
  };
}

function recalculateThreadLabels(thread: MailThreadSummary, messages: MailMessageRecord[]) {
  const labelIds = [...new Set(messages.flatMap((message) => message.labelIds))];
  return {
    ...thread,
    labelIds,
    starred: messages.some((message) => message.labelIds.includes("STARRED")),
    unread: messages.some((message) => message.labelIds.includes("UNREAD")),
  };
}

function closeMailDatabase(name: string) {
  const database = openDatabases.get(name);
  database?.close();
  openDatabases.delete(name);
}

export async function destroyMailDatabase(name: string) {
  await prepareMailDatabasesForDeletion(name);
  await deleteMailDatabaseWithTimeout(name);
}

export async function prepareMailDatabasesForDeletion(prefix: string) {
  closeMailDatabasesForPrefix(prefix);
  const channel = initializeLifecycleChannel();
  channel?.postMessage({ prefix, type: "close" });
  if (channel) await new Promise((resolve) => globalThis.setTimeout(resolve, 75));
}

function mailDatabasePrefix(input: { apiOrigin: string; userId?: string; workspaceId?: string }) {
  const origin = encodeURIComponent(new URL(input.apiOrigin).origin);
  if (!input.userId) return `zilobase:v2:${origin}:`;
  const user = encodeURIComponent(requireIdentifier(input.userId, "user"));
  if (!input.workspaceId) return `zilobase:v2:${origin}:${user}:workspace:`;
  const workspace = encodeURIComponent(requireIdentifier(input.workspaceId, "workspace"));
  return `zilobase:v2:${origin}:${user}:workspace:${workspace}:mail:`;
}

class MailCacheError extends Error {
  constructor(
    message: string,
    readonly code: "delete_blocked" | "schema_incompatible",
  ) {
    super(message);
    this.name = "MailCacheError";
  }
}

function closeMailDatabasesForPrefix(prefix: string) {
  for (const [name, database] of openDatabases) {
    if (!name.startsWith(prefix)) continue;
    database.close();
    openDatabases.delete(name);
  }
}

function initializeLifecycleChannel() {
  if (lifecycleChannel || typeof window === "undefined" || typeof BroadcastChannel === "undefined")
    return lifecycleChannel;
  lifecycleChannel = new BroadcastChannel(MAIL_LIFECYCLE_CHANNEL);
  const nodeChannel = lifecycleChannel as BroadcastChannel & { unref?: () => void };
  nodeChannel.unref?.();
  lifecycleChannel.addEventListener("message", (event: MessageEvent<unknown>) => {
    const value = event.data as { prefix?: unknown; type?: unknown } | null;
    if (value?.type === "close" && typeof value.prefix === "string")
      closeMailDatabasesForPrefix(value.prefix);
  });
  return lifecycleChannel;
}

async function deleteMailDatabaseWithTimeout(name: string) {
  closeMailDatabase(name);
  let timeout = 0;
  try {
    await Promise.race([
      Dexie.delete(name),
      new Promise<never>((_, reject) => {
        timeout = globalThis.setTimeout(
          () => reject(new MailCacheError("Local mail storage is still in use.", "delete_blocked")),
          3_000,
        ) as unknown as number;
      }),
    ]);
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

async function destroyOtherConnectionDatabases(input: MailDatabaseIdentity, currentName: string) {
  const prefix = mailDatabasePrefix(input);
  const names = await Dexie.getDatabaseNames();
  await Promise.all(
    names
      .filter((name) => name.startsWith(prefix) && name !== currentName)
      .map(destroyMailDatabase),
  );
}

function isRecoverableMailCacheError(error: unknown) {
  if (error instanceof MailCacheError) return error.code === "schema_incompatible";
  return (
    error instanceof Error &&
    ["DatabaseClosedError", "InvalidStateError", "UnknownError", "VersionError"].includes(
      error.name,
    )
  );
}

function requireIdentifier(value: string, kind: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 512) {
    throw new Error(`A valid mail ${kind} identifier is required.`);
  }
  return normalized;
}

function uniqueLimited(values: string[]) {
  return [...new Set(values)].slice(-100);
}
