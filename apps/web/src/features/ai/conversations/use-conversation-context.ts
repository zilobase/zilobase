import { canApplyConversationEdits } from "./model/conversation-draft";
import { useMemo } from "react";
import type {
  ContextAttachment,
  ContextSourceRef,
} from "@zilobase/page-context";
import {
  usePageNavigation,
  usePageAccessLevel,
} from "@zilobase/features/pages/react";
import { useDatabaseMetadata } from "@/features/databases/hooks/use-database-metadata";
import { buildPrimaryAttachment } from "./components/elements/context-attach-menu";
import { usePageAiContext } from "../context/use-page-ai-context";

export function useConversationContext({
  attachments,
  primaryDismissed,
  workspaceId,
  isSidebar,
  pageId,
  databaseId,
}: {
  attachments: ContextAttachment[];
  primaryDismissed: boolean;
  workspaceId: string | null;
  isSidebar: boolean;
  pageId: string | null;
  databaseId: string | null;
}) {
  const primarySource = useMemo<ContextSourceRef | null>(() => {
    if (pageId) {
      return { type: "page", id: pageId, role: "primary" };
    }

    if (databaseId) {
      return { type: "database", id: databaseId, role: "primary" };
    }

    return null;
  }, [databaseId, pageId]);
  const effectivePrimarySource = primaryDismissed ? null : primarySource;
  const { data: navigation } = usePageNavigation(workspaceId, {
    enabled: isSidebar && Boolean(workspaceId),
  });
  const pages = navigation?.pages ?? [];
  const { data: pageAccessLevel } = usePageAccessLevel(
    isSidebar ? pageId : null,
    {
      refetchOnMount: false,
    },
  );
  const { data: databasePayload } = useDatabaseMetadata(databaseId);
  const primaryAttachment = useMemo(() => {
    if (!effectivePrimarySource) {
      return null;
    }

    const databaseConfig = databasePayload?.database.config;
    const databaseEmoji =
      databaseConfig &&
      typeof databaseConfig === "object" &&
      !Array.isArray(databaseConfig) &&
      typeof (databaseConfig as { emoji?: unknown }).emoji === "string"
        ? (databaseConfig as { emoji: string }).emoji
        : null;

    return (
      buildPrimaryAttachment({
        databaseEmoji,
        databaseName: databasePayload?.database.name,
        databasePageId: databasePayload?.database.pageId,
        primarySource: effectivePrimarySource,
        pages,
        placements: navigation?.placements ?? [],
      }) ?? {
        emoji: databaseEmoji,
        id: effectivePrimarySource.id,
        path: "",
        title:
          effectivePrimarySource.type === "database"
            ? databasePayload?.database.name?.trim() || "Database"
            : "Current page",
        type: effectivePrimarySource.type,
      }
    );
  }, [databasePayload, effectivePrimarySource, navigation?.placements, pages]);
  const {
    error: contextError,
    isLoading: isContextLoading,
    markdown: pageContext,
  } = usePageAiContext({
    attachments,
    enabled: isSidebar && Boolean(workspaceId),
    workspaceId,
    primarySource: effectivePrimarySource,
  });
  const allowedPageIds = useMemo(() => {
    const ids = new Set<string>();

    if (effectivePrimarySource?.type === "page") {
      ids.add(effectivePrimarySource.id);
    }

    for (const attachment of attachments) {
      if (attachment.type === "page") {
        ids.add(attachment.id);
      }
    }

    return [...ids];
  }, [attachments, effectivePrimarySource]);

  const canApplyPageEdits = canApplyConversationEdits(
    isSidebar,
    pageId,
    pageAccessLevel,
  );

  return {
    primarySource,
    effectivePrimarySource,
    primaryAttachment,
    contextError,
    isContextLoading,
    pageContext,
    pageAccessLevel,
    allowedPageIds,
    canApplyPageEdits,
  };
}
