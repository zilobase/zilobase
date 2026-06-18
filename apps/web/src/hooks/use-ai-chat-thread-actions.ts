"use client";

import {
  useAiChatThreads,
  useArchiveAiChatThread,
  useCreateAiChatThread,
  useDeleteAiChatThread,
} from "@notelab/features/ai-chat";
import { useCallback } from "react";
import { toast } from "sonner";

export function useAiChatThreadActions({
  activeThreadId,
  onSelectThread,
}: {
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
}) {
  const threadsQuery = useAiChatThreads();
  const createThread = useCreateAiChatThread();
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

      const response = await createThread.mutateAsync({});
      onSelectThread(response.thread.id);
    },
    [activeThreadId, createThread, onSelectThread, threads],
  );

  const handleCreateThread = useCallback(async () => {
    try {
      const response = await createThread.mutateAsync({});
      onSelectThread(response.thread.id);
      return response.thread.id;
    } catch (error) {
      toast.error("Failed to create chat", {
        description: error instanceof Error ? error.message : "Try again.",
      });
      return null;
    }
  }, [createThread, onSelectThread]);

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
    createThread,
    deleteThread,
    archiveThread,
    handleCreateThread,
    handleDeleteThread,
    handleArchiveThread,
  };
}