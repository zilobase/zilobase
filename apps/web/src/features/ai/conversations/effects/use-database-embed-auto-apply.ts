import { useEffect, useRef } from "react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";

import { readDatabaseConfigToolIds } from "@zilobase/features/ai-chat";
import { insertDatabaseBlockInContent } from "@zilobase/page-context";

import {
  usePageEditorRegistry,
  usePageEditorRegistryVersion,
} from "@/features/editor/runtime/page-editor-registry";

const EMBED_DATABASE_IN_PAGE_TOOLS = new Set(["buildDatabaseFromBlueprint", "embedDatabaseInPage"]);

type UseDatabaseEmbedAutoApplyOptions = {
  enabled?: boolean;
  messages: UIMessage[];
};

function readEmbedAfterHeading(input: unknown) {
  if (!input || typeof input !== "object") {
    return undefined;
  }

  const afterHeading = (input as { afterHeading?: unknown }).afterHeading;

  return typeof afterHeading === "string" && afterHeading.trim().length > 0
    ? afterHeading.trim()
    : undefined;
}

function readEmbedShowTitle(input: unknown, output: unknown) {
  if (output && typeof output === "object" && !Array.isArray(output)) {
    const data = (output as { data?: unknown }).data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const showTitle = (data as { showInlineDatabaseTitle?: unknown }).showInlineDatabaseTitle;
      if (typeof showTitle === "boolean") return showTitle;
    }
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }
  const showTitle = (input as { showTitle?: unknown }).showTitle;
  return typeof showTitle === "boolean" ? showTitle : undefined;
}

function readCompletedEmbed(part: UIMessage["parts"][number]) {
  if (!isToolUIPart(part) || part.state !== "output-available") return null;
  if (!EMBED_DATABASE_IN_PAGE_TOOLS.has(getToolName(part))) return null;
  const ids = readDatabaseConfigToolIds(part.output);
  const pageId = ids?.pageId;
  const databaseId = ids?.databaseId;
  if (!pageId || !databaseId) return null;
  return { part, pageId, databaseId };
}

export function useDatabaseEmbedAutoApply({
  enabled = true,
  messages,
}: UseDatabaseEmbedAutoApplyOptions) {
  const { getEditorHandle } = usePageEditorRegistry();
  const editorRegistryVersion = usePageEditorRegistryVersion();
  const handledToolCallIds = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) {
      return;
    }

    function applyEmbed(messagePart: UIMessage["parts"][number]) {
      const completed = readCompletedEmbed(messagePart);
      if (!completed) return;
      const { part, pageId, databaseId } = completed;
      if (handledToolCallIds.current.has(part.toolCallId)) return;
      const handle = getEditorHandle(pageId);

      if (!handle?.isEditable()) {
        return;
      }

      try {
        const currentContent = handle.getContentJson();
        const { content, alreadyEmbedded, titleUpdated } = insertDatabaseBlockInContent(
          currentContent,
          {
            afterHeading: readEmbedAfterHeading(part.input),
            databaseId,
            showTitle: readEmbedShowTitle(part.input, part.output),
          },
        );

        if ((!alreadyEmbedded || titleUpdated) && !handle.setContentJson(content)) {
          return;
        }

        handledToolCallIds.current.add(part.toolCallId);
      } catch (error) {
        console.warn("Failed to apply database embed in editor", error);
      }
    }

    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts) applyEmbed(part);
    }
  }, [editorRegistryVersion, enabled, getEditorHandle, messages]);
}
