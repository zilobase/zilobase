"use client";

import {
  useAiChatThreads,
  useArchiveAiChatThread,
  useDeleteAiChatThread,
} from "@zilobase/features/ai-chat";
import { useCallback } from "react";
import { toast } from "sonner";

export function useAiChatThreadActions({
  activeThreadId,
  enabled = true,
  onSelectThread,
}: {
  activeThreadId: string | null;
  enabled?: boolean;
  onSelectThread: (threadId: string | null) => void;
}) {
  const threadsQuery = useAiChatThreads({ enabled });
  const deleteThread = useDeleteAiChatThread();
  const archiveThread = useArchiveAiChatThread();
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

  return {
    threads,
    threadsQuery,
    deleteThread,
    archiveThread,
    handleStartNewChat,
    handleDeleteThread,
    handleArchiveThread,
  };
}
