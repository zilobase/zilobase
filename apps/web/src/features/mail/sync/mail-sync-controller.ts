import { readCachedMailThreads } from "../storage/mail-cache-query";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateMailListQueries, mailKeys } from "@zilobase/features/mail";
import { runMailRefreshOnce } from "./mail-refresh-queue";
import { isDefiniteMailMutationFailure } from "./mail-mutations";
import { drainMailMutationOutbox } from "./mail-outbox";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";
import type {
  MailFilterExpression,
  MailConnection,
  MailLabelRecord,
  MailMailboxChanges,
  MailLabelWriteRequest,
  MailMessageRecord,
  MailMessageMutationResponse,
  MailModifyRequest,
  MailThreadSummary,
  MailThreadMutationResponse,
  MailView,
} from "@zilobase/features/mail";
import {
  evaluateMailFilterExpression,
  mailApiBasePath,
  mailFilterRecordFromThreadSummary,
} from "@zilobase/features/mail";

import { ApiError, apiFetch, getApiRequestHeaders, toApiUrl } from "@/platform/network/api";
import { desktopNetworkFetch } from "@/platform/network";
import {
  describeDesktopError,
  recordDesktopDiagnostic,
} from "@/features/desktop/diagnostics/index";
import { getConnectivityState, subscribeConnectivity } from "@/platform/network/connectivity";
import {
  applyMailboxSnapshot,
  clearMailReconciliation,
  deleteMailLabelFromCache,
  deleteMailMessageFromCache,
  deleteMailThreadFromCache,
  enqueueMailMutation,
  mailThreadMatchesView,
  openMailDatabase,
  optimisticallyModifyThread,
  optimisticallyModifyMessage,
  reconcileMailMessage,
  upsertFullMailThread,
  type MailDatabase,
} from "../storage/mail-database";
import { safeMailDownloadFilename } from "../messages/mail-attachment";
import { loadMailThreadOnce } from "../messages/mail-thread-loader";

export function useMailController(input: {
  connection: MailConnection;
  filter?: MailFilterExpression | null;
  query: string;
  userId: string;
  view: MailView;
}) {
  const queryClient = useQueryClient();
  const retryAt = useRef(0);
  const revoked = useRef(false);
  const mailBasePath = mailApiBasePath(input.connection.workspaceId);
  const [cacheLimit, setCacheLimit] = useState(50);
  const [database, setDatabase] = useState<MailDatabase | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const threadLoads = useRef(new Map<string, Promise<void>>());
  const online = useSyncExternalStore(
    subscribeConnectivity,
    () => getConnectivityState() === "online",
    () => true,
  );

  useEffect(() => {
    if (
      !input.connection.connectionId ||
      !input.connection.bindingId ||
      !input.connection.workspaceId
    )
      return;
    setDatabase(null);
    const identity = {
      apiOrigin: new URL(toApiUrl("/"), window.location.origin).origin,
      bindingId: input.connection.bindingId,
      connectionId: input.connection.connectionId,
      userId: input.userId,
      workspaceId: input.connection.workspaceId,
    };
    let active = true;
    void openMailDatabase(identity)
      .then((next) => {
        if (!active) return;
        setError(null);
        setDatabase(next);
      })
      .catch((cacheError) => {
        if (!active) return;
        recordDesktopDiagnostic("mail.cache_failure", describeDesktopError(cacheError), "error");
        setError(cacheError);
      });
    return () => {
      // This cleanup only cancels this React consumer. Explicit lifecycle events
      // such as disconnect, logout, and server replacement own cache closure.
      active = false;
    };
  }, [
    input.connection.bindingId,
    input.connection.connectionId,
    input.connection.workspaceId,
    input.userId,
  ]);

  const cachedThreads = useLiveQuery(
    () =>
      database
        ? readCachedMailThreads(database, input.view, cacheLimit + 1, input.filter, input.query)
        : [],
    [database, input.view, input.filter, input.query, cacheLimit],
    [],
  );
  const syncState = useLiveQuery(() => database?.syncState.get("primary"), [database], undefined);
  const labels = useLiveQuery(
    () => (database ? database.labels.orderBy("name").toArray() : []),
    [database],
    [],
  );

  const runSync = useCallback(async () => {
    if (!database || !input.connection.connectionId || !online) return null;
    if (revoked.current || Date.now() < retryAt.current) return null;
    setSyncing(true);
    setError(null);
    try {
      return await runMailRefreshOnce(database.name, async () => {
        let state = await database.syncState.get("primary");
        if (!state) throw new Error("Mail cache identity is missing.");
        const notifyForChanges = state.revision > 0;
        const arrivals = new Map<string, MailThreadSummary>();
        let labels: MailLabelRecord[] = [];
        for (let page = 0; page < 100; page += 1) {
          const changes = await apiFetch<MailMailboxChanges>(
            `${mailBasePath}/changes?afterRevision=${state.revision ?? 0}&limit=100`,
          );
          if (notifyForChanges && changes.threads.length) {
            const existing = await database.threads.bulkGet(
              changes.threads.map((thread) => thread.id),
            );
            for (const [index, thread] of changes.threads.entries()) {
              if (
                thread.unread &&
                thread.labelIds.includes("INBOX") &&
                !thread.labelIds.includes("DRAFT") &&
                existing[index]?.latestMessageId !== thread.latestMessageId
              )
                arrivals.set(thread.id, thread);
            }
          }
          await applyMailboxSnapshot(database, changes);
          labels = changes.labels.length ? changes.labels : labels;
          state = (await database.syncState.get("primary")) ?? state;
          if (changes.resetRequired || !changes.hasMore) break;
        }
        await invalidateMailListQueries(queryClient, {
          bindingId: input.connection.bindingId,
          workspaceId: input.connection.workspaceId,
        });
        announceMailArrivals([...arrivals.values()]);
        return { labels };
      });
    } catch (syncError) {
      if (syncError instanceof ApiError) {
        const body = syncError.body as { retryAfterMs?: number; code?: string } | null;
        if (body?.retryAfterMs) retryAt.current = Date.now() + body.retryAfterMs;
        if (body?.code === "authorization_revoked") {
          revoked.current = true;
          void queryClient.invalidateQueries({
            queryKey: mailKeys.connection(input.connection.workspaceId),
          });
        }
      }
      setError(syncError);
      return null;
    } finally {
      setSyncing(false);
    }
  }, [
    database,
    input.connection.connectionId,
    input.connection.bindingId,
    input.connection.workspaceId,
    online,
    queryClient,
  ]);

  useEffect(() => {
    if (!database || !online) return;
    const timer = window.setTimeout(() => void runSync(), 0);
    return () => window.clearTimeout(timer);
  }, [database, input.view, online, runSync]);

  const threads = useMemo(() => {
    const visible = (cachedThreads ?? [])
      .slice(0, cacheLimit)
      .filter((thread) =>
        input.filter
          ? evaluateMailFilterExpression(mailFilterRecordFromThreadSummary(thread), input.filter)
          : mailThreadMatchesView(thread, input.view),
      );
    const query = input.query.trim().toLowerCase();
    if (!query) return visible;
    return visible.filter((thread) =>
      [
        thread.subject,
        thread.snippet,
        ...thread.participants.flatMap((participant) => [
          participant.name ?? "",
          participant.address,
        ]),
      ].some((value) => value.toLowerCase().includes(query)),
    );
  }, [cachedThreads, cacheLimit, input.filter, input.query, input.view]);

  const loadThread = useCallback(
    (threadId: string) => {
      if (!database) return;
      const key = `${database.name}:${threadId}`;
      return loadMailThreadOnce(threadLoads.current, key, async () => {
        const cached = await database.messages.where("threadId").equals(threadId).toArray();
        if (!online || (cached.length > 0 && cached.every((message) => message.hasFullBody)))
          return;
        const response = await apiFetch<{
          messages: MailMessageRecord[];
          thread: MailThreadSummary;
        }>(`${mailBasePath}/threads/${encodeURIComponent(threadId)}`);
        await upsertFullMailThread(database, response);
        if (!response.messages.every((message) => message.hasFullBody)) {
          await apiFetch(`${mailBasePath}/threads/${encodeURIComponent(threadId)}/hydrate`, {
            body: "{}",
            method: "POST",
          });
        }
      });
    },
    [database, online],
  );

  const openThread = useCallback(
    async (threadId: string) => {
      try {
        await loadThread(threadId);
      } catch (threadError) {
        setError(threadError);
      }
    },
    [loadThread],
  );

  const prefetchThread = useCallback(
    async (threadId: string) => {
      try {
        await loadThread(threadId);
      } catch {
        // Intent prefetch is opportunistic; a foreground open retries and reports failures.
      }
    },
    [loadThread],
  );

  const downloadAttachment = useCallback(
    async (messageId: string, attachmentId: string, filename: string) => {
      if (!online) throw new Error("Reconnect to download attachments.");
      const blob = await fetchAttachmentBlob(messageId, attachmentId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = safeMailDownloadFilename(filename);
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    },
    [online],
  );

  const loadInlineAttachment = useCallback(
    async (messageId: string, attachmentId: string) => {
      if (!online) throw new Error("Reconnect to load inline images.");
      return URL.createObjectURL(await fetchAttachmentBlob(messageId, attachmentId));
    },
    [online],
  );

  const fetchAttachmentBlob = async (messageId: string, attachmentId: string) => {
    const response = await desktopNetworkFetch(
      toApiUrl(
        `${mailBasePath}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
      ),
      { credentials: "include", headers: getApiRequestHeaders() },
    );
    if (!response.ok) throw new Error("The attachment could not be downloaded.");
    return response.blob();
  };

  const modifyThread = useCallback(
    async (threadId: string, modification: MailModifyRequest) => {
      if (!database) throw new Error("Mail is still loading.");
      setMutating(true);
      try {
        await optimisticallyModifyThread(database, threadId, modification);
        await enqueueMailMutation(database, {
          kind: "thread_modify",
          modification,
          targetId: threadId,
        });
        if (online) await drainMailMutationOutbox(database, mailBasePath);
      } finally {
        setMutating(false);
        void runSync();
      }
    },
    [database, online, runSync],
  );

  const batchModifyThreads = useCallback(
    async (threadIds: string[], modification: MailModifyRequest) => {
      if (!database) throw new Error("Mail is still loading.");
      if (!threadIds.length || threadIds.length > 50)
        throw new Error("Select between 1 and 50 Gmail threads.");
      setMutating(true);
      try {
        for (const threadId of threadIds) {
          await optimisticallyModifyThread(database, threadId, modification);
          await enqueueMailMutation(database, {
            kind: "thread_modify",
            modification,
            targetId: threadId,
          });
        }
        if (online) await drainMailMutationOutbox(database, mailBasePath);
      } finally {
        setMutating(false);
        void runSync();
      }
    },
    [database, online, runSync],
  );

  const actOnThread = useCallback(
    async (threadId: string, action: "restore" | "trash") => {
      if (!database) throw new Error("Mail is still loading.");
      const modification =
        action === "trash"
          ? { addLabelIds: ["TRASH"], removeLabelIds: ["INBOX"] }
          : { removeLabelIds: ["TRASH"] };
      setMutating(true);
      try {
        await optimisticallyModifyThread(database, threadId, modification);
        await enqueueMailMutation(database, {
          action,
          kind: "thread_action",
          modification,
          targetId: threadId,
        });
        if (online) await drainMailMutationOutbox(database, mailBasePath);
      } finally {
        setMutating(false);
        void runSync();
      }
    },
    [database, online, runSync],
  );

  const modifyMessage = useCallback(
    async (messageId: string, modification: MailModifyRequest) => {
      if (!database) throw new Error("Mail is still loading.");
      setMutating(true);
      try {
        await optimisticallyModifyMessage(database, messageId, modification);
        await enqueueMailMutation(database, {
          kind: "message_modify",
          modification,
          targetId: messageId,
        });
        if (online) await drainMailMutationOutbox(database, mailBasePath);
      } finally {
        setMutating(false);
        void runSync();
      }
    },
    [database, online, runSync],
  );

  const actOnMessage = useCallback(
    async (messageId: string, action: "restore" | "trash") => {
      if (!database) throw new Error("Mail is still loading.");
      const modification =
        action === "trash"
          ? { addLabelIds: ["TRASH"], removeLabelIds: ["INBOX"] }
          : { removeLabelIds: ["TRASH"] };
      setMutating(true);
      try {
        await optimisticallyModifyMessage(database, messageId, modification);
        await enqueueMailMutation(database, {
          action,
          kind: "message_action",
          modification,
          targetId: messageId,
        });
        if (online) await drainMailMutationOutbox(database, mailBasePath);
      } finally {
        setMutating(false);
        void runSync();
      }
    },
    [database, online, runSync],
  );

  const createLabel = useCallback(
    async (input: MailLabelWriteRequest) => {
      if (!database || !online) throw new Error("Reconnect to manage Gmail labels.");
      setMutating(true);
      try {
        const { label } = await apiFetch<{ label: MailLabelRecord }>(`${mailBasePath}/labels`, {
          body: JSON.stringify(input),
          method: "POST",
        });
        await database.labels.put(label);
        return label;
      } finally {
        setMutating(false);
        void runSync();
      }
    },
    [database, online, runSync],
  );

  const updateLabel = useCallback(
    async (label: MailLabelRecord, input: MailLabelWriteRequest) => {
      if (!database || !online) throw new Error("Reconnect to manage Gmail labels.");
      setMutating(true);
      try {
        await database.labels.put({ ...label, ...input });
        const response = await apiFetch<{ label: MailLabelRecord }>(
          `${mailBasePath}/labels/${encodeURIComponent(label.id)}`,
          { body: JSON.stringify(input), method: "PATCH" },
        );
        await database.labels.put(response.label);
        return response.label;
      } catch (mutationError) {
        if (isDefiniteMailMutationFailure(mutationError)) await database.labels.put(label);
        else void runSync();
        throw mutationError;
      } finally {
        setMutating(false);
        void runSync();
      }
    },
    [database, online, runSync],
  );

  const deleteLabel = useCallback(
    async (labelId: string) => {
      if (!database || !online) throw new Error("Reconnect to manage Gmail labels.");
      setMutating(true);
      try {
        await apiFetch(`${mailBasePath}/labels/${encodeURIComponent(labelId)}`, {
          method: "DELETE",
        });
        await deleteMailLabelFromCache(database, labelId);
      } finally {
        setMutating(false);
        void runSync();
      }
    },
    [database, online],
  );

  const reconcilePending = useCallback(async () => {
    if (!database || !online) return;
    const state = await database.syncState.get("primary");
    for (const threadId of state?.pendingThreadReconciliationIds ?? []) {
      try {
        const response = await apiFetch<MailThreadMutationResponse>(
          `${mailBasePath}/threads/${encodeURIComponent(threadId)}`,
        );
        await upsertFullMailThread(database, response);
        await clearMailReconciliation(database, { threadId });
      } catch (reconciliationError) {
        if (reconciliationError instanceof ApiError && reconciliationError.status === 404) {
          await deleteMailThreadFromCache(database, threadId);
          await clearMailReconciliation(database, { threadId });
          continue;
        }
        return;
      }
    }
    for (const messageId of state?.pendingMessageReconciliationIds ?? []) {
      try {
        const response = await apiFetch<MailMessageMutationResponse>(
          `${mailBasePath}/messages/${encodeURIComponent(messageId)}`,
        );
        await reconcileMailMessage(database, response.message);
        await clearMailReconciliation(database, { messageId });
      } catch (reconciliationError) {
        if (reconciliationError instanceof ApiError && reconciliationError.status === 404) {
          await deleteMailMessageFromCache(database, messageId);
          await clearMailReconciliation(database, { messageId });
          continue;
        }
        return;
      }
    }
    if (
      (state?.pendingThreadReconciliationIds?.length ?? 0) +
        (state?.pendingMessageReconciliationIds?.length ?? 0) >
      0
    ) {
      void runSync();
    }
  }, [database, online, runSync]);

  useEffect(() => {
    if (!database || !online) return;
    const timer = window.setTimeout(() => void reconcilePending(), 0);
    return () => window.clearTimeout(timer);
  }, [
    database,
    online,
    reconcilePending,
    syncState?.pendingMessageReconciliationIds,
    syncState?.pendingThreadReconciliationIds,
  ]);

  useEffect(() => {
    if (!database || !online) return;
    const timer = window.setTimeout(() => {
      void drainMailMutationOutbox(database, mailBasePath)
        .then(() => runSync())
        .catch((outboxError) => setError(outboxError));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [database, mailBasePath, online, runSync]);

  return {
    database,
    actOnMessage,
    actOnThread,
    batchModifyThreads,
    createLabel,
    deleteLabel,
    downloadAttachment,
    error,
    hasMore: (cachedThreads?.length ?? 0) > cacheLimit,
    labels: labels ?? [],
    loadInlineAttachment,
    modifyMessage,
    modifyThread,
    mutating,
    online,
    openThread,
    prefetchThread,
    refresh: runSync,
    loadMore: () => {
      setCacheLimit((limit) => limit + 50);
      return Promise.resolve(null);
    },
    syncing,
    threads,
    updateLabel,
  };
}

function announceMailArrivals(threads: MailThreadSummary[]) {
  const latest = threads.at(-1);
  if (!latest) return;
  const sender = latest.participants[0]?.name ?? latest.participants[0]?.address ?? "New mail";
  const description = threads.length > 1 ? `${threads.length} new conversations` : sender;
  if (
    document.visibilityState !== "visible" &&
    typeof Notification !== "undefined" &&
    Notification.permission === "granted"
  ) {
    const notification = new Notification(latest.subject || "New message", {
      body: description,
      tag: `zilobase-mail-${latest.id}`,
    });
    notification.onclick = () => window.focus();
    return;
  }
  toast.info(latest.subject || "New message", {
    description,
    id: `mail-arrival-${latest.id}`,
  });
}
