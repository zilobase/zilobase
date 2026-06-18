import { useActiveOrganizationId } from "@notelab/features/integrations";
import {
  useAiChatThreads,
  useCreateAiChatThread,
} from "@notelab/features/ai-chat";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function getStorageKey(organizationId: string) {
  return `ai-chat-thread:${organizationId}`;
}

export function useAiChatThreadState() {
  const navigate = useNavigate();
  const location = useLocation();
  const organizationId = useActiveOrganizationId();
  const threadsQuery = useAiChatThreads();
  const createThread = useCreateAiChatThread();
  const bootstrapRef = useRef(false);
  const searchThreadId = useMemo(() => {
    const params = new URLSearchParams(location.searchStr);

    return params.get("thread")?.trim() || null;
  }, [location.searchStr]);
  const [activeThreadId, setActiveThreadIdState] = useState<string | null>(() => {
    if (!organizationId) {
      return null;
    }

    if (location.pathname === "/ai" && searchThreadId) {
      return searchThreadId;
    }

    return sessionStorage.getItem(getStorageKey(organizationId));
  });

  const setActiveThreadId = useCallback(
    (threadId: string | null) => {
      setActiveThreadIdState(threadId);

      if (organizationId && threadId) {
        sessionStorage.setItem(getStorageKey(organizationId), threadId);
      }

      if (location.pathname === "/ai") {
        void navigate({
          to: "/ai",
          search: { thread: threadId ?? undefined },
          replace: true,
        });
      }
    },
    [location.pathname, navigate, organizationId],
  );

  useEffect(() => {
    if (!organizationId) {
      return;
    }

    if (location.pathname === "/ai" && searchThreadId) {
      setActiveThreadIdState(searchThreadId);
      sessionStorage.setItem(getStorageKey(organizationId), searchThreadId);
    }
  }, [location.pathname, organizationId, searchThreadId]);

  useEffect(() => {
    bootstrapRef.current = false;
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId || bootstrapRef.current || threadsQuery.isLoading) {
      return;
    }

    const threads = threadsQuery.data?.threads ?? [];

    if (
      activeThreadId &&
      threads.some((thread) => thread.id === activeThreadId)
    ) {
      bootstrapRef.current = true;
      return;
    }

    if (threads.length > 0) {
      bootstrapRef.current = true;
      setActiveThreadId(threads[0].id);
      return;
    }

    if (createThread.isPending) {
      return;
    }

    bootstrapRef.current = true;

    void createThread.mutateAsync({}).then((response) => {
      setActiveThreadId(response.thread.id);
    });
  }, [
    activeThreadId,
    createThread,
    organizationId,
    setActiveThreadId,
    threadsQuery.data?.threads,
    threadsQuery.isLoading,
  ]);

  return {
    activeThreadId,
    isBootstrapping:
      !organizationId ||
      threadsQuery.isLoading ||
      createThread.isPending ||
      (!activeThreadId && !bootstrapRef.current),
    setActiveThreadId,
    threadsQuery,
  };
}