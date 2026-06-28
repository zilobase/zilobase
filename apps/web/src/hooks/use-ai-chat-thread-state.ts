import { useActiveWorkspaceId } from "@notelab/features/integrations";
import {
  useAiChatThreads,
  useCreateAiChatThread,
} from "@notelab/features/ai-chat";
import { useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { create } from "zustand";

type StoredAiChatThreadState = {
  activeThreadId: string | null;
  bootstrapped: boolean;
};

type AiChatThreadStore = {
  threadStateByWorkspaceId: Record<
    string,
    StoredAiChatThreadState | undefined
  >;
};

const emptyThreadState: StoredAiChatThreadState = {
  activeThreadId: null,
  bootstrapped: false,
};

const useAiChatThreadStore = create<AiChatThreadStore>()(() => ({
  threadStateByWorkspaceId: {},
}));

function updateStoredThreadState(
  workspaceId: string,
  getNext: (current: StoredAiChatThreadState) => StoredAiChatThreadState,
) {
  useAiChatThreadStore.setState((state) => {
    const current =
      state.threadStateByWorkspaceId[workspaceId] ?? emptyThreadState;
    const next = getNext(current);

    if (next === current) {
      return state;
    }

    return {
      threadStateByWorkspaceId: {
        ...state.threadStateByWorkspaceId,
        [workspaceId]: next,
      },
    };
  });
}

function initializeActiveThreadId(
  workspaceId: string,
  threadId: string | null,
) {
  useAiChatThreadStore.setState((state) => {
    if (state.threadStateByWorkspaceId[workspaceId]) {
      return state;
    }

    return {
      threadStateByWorkspaceId: {
        ...state.threadStateByWorkspaceId,
        [workspaceId]: { activeThreadId: threadId, bootstrapped: false },
      },
    };
  });
}

function setStoredActiveThreadId(
  workspaceId: string,
  threadId: string | null,
) {
  updateStoredThreadState(workspaceId, (current) =>
    current.activeThreadId === threadId
      ? current
      : { ...current, activeThreadId: threadId },
  );
}

function clearBootstrapped(workspaceId: string) {
  updateStoredThreadState(workspaceId, (current) =>
    current.bootstrapped ? { ...current, bootstrapped: false } : current,
  );
}

function markBootstrapped(workspaceId: string) {
  const current =
    useAiChatThreadStore.getState().threadStateByWorkspaceId[
      workspaceId
    ] ?? emptyThreadState;

  if (current.bootstrapped) {
    return false;
  }

  updateStoredThreadState(workspaceId, (latest) => ({
    ...latest,
    bootstrapped: true,
  }));

  return true;
}

function getStorageKey(workspaceId: string) {
  return `ai-chat-thread:${workspaceId}`;
}

function getCurrentUrlThreadId() {
  if (typeof window === "undefined") {
    return null;
  }

  return (
    new URLSearchParams(window.location.search).get("thread")?.trim() || null
  );
}

function replaceAiThreadSearchParam(threadId: string | null) {
  if (typeof window === "undefined" || window.location.pathname !== "/ai") {
    return;
  }

  const url = new URL(window.location.href);

  if (threadId) {
    url.searchParams.set("thread", threadId);
  } else {
    url.searchParams.delete("thread");
  }

  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

export function useAiChatThreadState() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const workspaceId = useActiveWorkspaceId();
  const threadsQuery = useAiChatThreads();
  const createThread = useCreateAiChatThread();
  const threadState = useAiChatThreadStore((state) =>
    workspaceId
      ? state.threadStateByWorkspaceId[workspaceId]
      : undefined,
  );

  const activeThreadId = threadState?.activeThreadId ?? null;
  const hasInitializedActiveThread = Boolean(threadState);
  const hasBootstrappedActiveThread = Boolean(threadState?.bootstrapped);

  const setActiveThreadId = useCallback(
    (threadId: string | null) => {
      if (!workspaceId) {
        return;
      }

      setStoredActiveThreadId(workspaceId, threadId);

      if (threadId) {
        sessionStorage.setItem(getStorageKey(workspaceId), threadId);
      } else {
        sessionStorage.removeItem(getStorageKey(workspaceId));
      }

      if (pathname === "/ai") {
        replaceAiThreadSearchParam(threadId);
      }
    },
    [workspaceId, pathname],
  );

  useEffect(() => {
    if (!workspaceId || hasInitializedActiveThread) {
      return;
    }

    const storedThreadId = sessionStorage.getItem(getStorageKey(workspaceId));
    const initialThreadId =
      pathname === "/ai"
        ? getCurrentUrlThreadId() ?? storedThreadId
        : storedThreadId;

    initializeActiveThreadId(workspaceId, initialThreadId);

    if (initialThreadId) {
      sessionStorage.setItem(getStorageKey(workspaceId), initialThreadId);
    }
  }, [hasInitializedActiveThread, workspaceId, pathname]);

  useEffect(() => {
    if (
      !workspaceId ||
      !hasInitializedActiveThread ||
      hasBootstrappedActiveThread ||
      threadsQuery.isLoading
    ) {
      return;
    }

    const threads = threadsQuery.data?.threads ?? [];

    if (
      activeThreadId &&
      threads.some((thread) => thread.id === activeThreadId)
    ) {
      markBootstrapped(workspaceId);
      return;
    }

    if (threads.length > 0) {
      if (markBootstrapped(workspaceId)) {
        setActiveThreadId(threads[0].id);
      }

      return;
    }

    if (createThread.isPending || !markBootstrapped(workspaceId)) {
      return;
    }

    void createThread
      .mutateAsync({})
      .then((response) => {
        setActiveThreadId(response.thread.id);
      })
      .catch(() => {
        clearBootstrapped(workspaceId);
      });
  }, [
    activeThreadId,
    createThread,
    hasBootstrappedActiveThread,
    hasInitializedActiveThread,
    workspaceId,
    setActiveThreadId,
    threadsQuery.data?.threads,
    threadsQuery.isLoading,
  ]);

  return {
    activeThreadId,
    isBootstrapping:
      !workspaceId ||
      !hasInitializedActiveThread ||
      !hasBootstrappedActiveThread ||
      threadsQuery.isLoading ||
      createThread.isPending ||
      !activeThreadId,
    setActiveThreadId,
    threadsQuery,
  };
}
