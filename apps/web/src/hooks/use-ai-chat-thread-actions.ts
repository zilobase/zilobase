"use client";

import {
  useAiChatThreads,
  useArchiveAiChatThread,
  useDeleteAiChatThread,
  useSetAiChatThreadPinned,
} from "@zilobase/features/ai-chat";
import { useCallback } from "react";
import { toast } from "sonner";

export function useAiChatThreadActions({
  activeThreadId,
  enabled = true,
  onSelectThread,
  search,
}: {
  activeThreadId: string | null;
  enabled?: boolean;
  onSelectThread: (threadId: string | null) => void;
  search?: string;
}) {
  const threadsQuery = useAiChatThreads({ enabled, search });
  const deleteThread = useDeleteAiChatThread();
  const archiveThread = useArchiveAiChatThread();
  const pinThread = useSetAiChatThreadPinned();
  const threads = threadsQuery.data?.threads ?? [];

  const selectFallbackThread = useCallback(
    async (removedThreadId: string) => {
      if (activeThreadId !== removedThreadId) {
        return;
      }

      const remaining = threads.filter((thread) => thread.id !== removedThreadId);

      if (remaining[0]) {
        onSelectThread(remaining[0].id);
        return;
      }

      onSelectThread(null);
    },
    [activeThreadId, onSelectThread, threads],
  );

  const handleStartNewChat = useCallback(() => {
    onSelectThread(null);
  }, [onSelectThread]);

  const handleDeleteThread = useCallback(
    async (threadId: string) => {
      try {
        await deleteThread.mutateAsync(threadId);
        await selectFallbackThread(threadId);
      } catch (error) {
        toast.error("Failed to delete chat", {
          description: error instanceof Error ? error.message : "Try again.",
        });
      }
    },
    [deleteThread, selectFallbackThread],
  );

  const handleArchiveThread = useCallback(
    async (threadId: string) => {
      try {
        await archiveThread.mutateAsync(threadId);
        await selectFallbackThread(threadId);
      } catch (error) {
        toast.error("Failed to archive chat", {
          description: error instanceof Error ? error.message : "Try again.",
        });
      }
    },
    [archiveThread, selectFallbackThread],
  );

  const handleSetPinned = useCallback(
    async (threadId: string, pinned: boolean) => {
      try {
        await pinThread.mutateAsync({ pinned, threadId });
      } catch (error) {
        toast.error(pinned ? "Failed to pin chat" : "Failed to unpin chat", {
          description: error instanceof Error ? error.message : "Try again.",
        });
      }
    },
    [pinThread],
  );

  return {
    threads,
    threadsQuery,
    deleteThread,
    archiveThread,
    pinThread,
    handleStartNewChat,
    handleDeleteThread,
    handleArchiveThread,
    handleSetPinned,
  };
}
