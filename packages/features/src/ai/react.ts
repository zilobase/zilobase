import { useCallback } from "react";
import { useZilobaseFeatures } from "../shared/context";
import type { ResourceRef } from "@zilobase/page-context";

/** Source chips fetch only authorized identity metadata, never source content. */
export function useChatAttachmentMetadata(workspaceId: string | null, ref: ResourceRef) {
  const context = useZilobaseFeatures();
  const metadata = useQuery(chatSourceOptions(context, workspaceId ?? "", ref));
  return metadata.data && !metadata.isError
    ? metadata.data
    : { title: metadata.isError ? `Unavailable ${ref.type}` : `Loading ${ref.type}…`, emoji: null };
}

import { sendChat } from "./stream";
export function useSendChat() {
  const context = useZilobaseFeatures();
  return useCallback(
    (...args: Parameters<typeof sendChat> extends [unknown, ...infer Rest] ? Rest : never) =>
      sendChat(context, ...args),
    [context],
  );
}

import { useQuery, useMutation } from "@tanstack/react-query";
import { useSession } from "../auth/react";
import {
  chatThreadsOptions,
  chatSelectionOptions,
  chatThreadOptions,
  chatThreadsKey,
  chatThreadKey,
  chatSourceOptions,
  chatRunDebugOptions,
  deleteChatConversation,
} from "./queries";
export function useChatThreads(workspaceId: string, threadId: string | null, enabled: boolean) {
  const context = useZilobaseFeatures();
  const list = useQuery({
    ...chatThreadsOptions(context, workspaceId),
    refetchInterval: (query) =>
      query.state.data?.some((thread) => ["queued", "running"].includes(thread.status ?? ""))
        ? 2000
        : 15_000,
  });
  const detail = useQuery({
    ...chatThreadOptions(context, workspaceId, threadId ?? ""),
    enabled: enabled && !!threadId,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteChatConversation(context, workspaceId, id),
  });
  const refresh = () =>
    Promise.all([
      context.queryClient.invalidateQueries({ queryKey: chatThreadsKey(workspaceId) }),
      threadId
        ? context.queryClient.invalidateQueries({ queryKey: chatThreadKey(workspaceId, threadId) })
        : Promise.resolve(),
    ]);
  return { list, detail, remove, refresh };
}

export function useChatSelection(workspaceId: string) {
  const { queryClient } = useZilobaseFeatures();
  const { data: session } = useSession();
  const options = chatSelectionOptions(workspaceId, session?.session?.id);
  const query = useQuery(options);
  return {
    ...query.data,
    isCurrent: (revision: number) =>
      queryClient.getQueryData(options.queryKey)?.revision === revision,
    select: (id: string | null) =>
      queryClient.setQueryData(options.queryKey, (current) => ({
        id,
        initialized: true,
        revision: (current?.revision ?? 0) + 1,
      }))!,
  };
}

import { followChatRun, cancelChatRun, recoverChatSubmission } from "./durable";
export function useFollowChatRun() {
  const context = useZilobaseFeatures();
  return useCallback(
    (...args: Parameters<typeof followChatRun> extends [unknown, ...infer Rest] ? Rest : never) =>
      followChatRun(context, ...args),
    [context],
  );
}
export function useCancelChatRun() {
  const context = useZilobaseFeatures();
  return useCallback(
    (runId: string, workspaceId: string) => cancelChatRun(context, runId, workspaceId),
    [context],
  );
}
export function useRecoverChatSubmission() {
  const context = useZilobaseFeatures();
  return useCallback(
    (workspaceId: string) => recoverChatSubmission(context, workspaceId),
    [context],
  );
}

/** Fetch raw run payloads only while the debugger is open; never persist this query. */
export function useChatRunDebug(workspaceId: string, runId: string, enabled: boolean) {
  const context = useZilobaseFeatures();
  return useQuery({
    ...chatRunDebugOptions(context, workspaceId, runId),
    enabled: enabled && !!workspaceId && !!runId,
    refetchInterval: (query) =>
      query.state.error
        ? false
        : query.state.data && !["queued", "running"].includes(query.state.data.status)
          ? false
          : 1000,
    refetchOnWindowFocus: true,
  });
}

import type { AiWriteRequest } from "./contracts";
import { refreshAfterWorkspaceActions } from "./changes";
import type { ChatToolActivity } from "./tools";
import { requestAiWriting, undoAiAction } from "./writing";
/** Generates Markdown for the editor's inline AI; the caller previews and applies it. */
export function useAiWriting() {
  const context = useZilobaseFeatures();
  return useMutation({ mutationFn: (input: AiWriteRequest) => requestAiWriting(context, input) });
}

/** Undoes an AI change from its activity card and refreshes the reads it affected. */
export function useUndoAiAction(workspaceId: string) {
  const context = useZilobaseFeatures();
  return useMutation({
    mutationFn: async (activity: ChatToolActivity) => {
      if (!activity.invocationId) throw new Error("This change can't be undone.");
      const result = await undoAiAction(context, {
        workspaceId,
        invocationId: activity.invocationId,
        callId: activity.id,
      });
      await refreshAfterWorkspaceActions(
        context.queryClient,
        workspaceId,
        { canContinue: false, activities: [activity] },
        new Set(),
      );
      return result;
    },
  });
}
