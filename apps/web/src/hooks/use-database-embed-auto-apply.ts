import { useEffect, useRef } from "react"
import { getToolName, isToolUIPart, type UIMessage } from "ai"

import { readDatabaseConfigToolIds } from "@notelab/features/ai-chat"
import { insertDatabaseBlockInContent } from "@notelab/page-context"

import { usePageEditorRegistry } from "@/contexts/page-editor-registry"

const EMBED_DATABASE_IN_PAGE_TOOL = "embedDatabaseInPage"

type UseDatabaseEmbedAutoApplyOptions = {
  enabled?: boolean
  messages: UIMessage[]
}

function readEmbedAfterHeading(input: unknown) {
  if (!input || typeof input !== "object") {
    return undefined
  }

  const afterHeading = (input as { afterHeading?: unknown }).afterHeading

  return typeof afterHeading === "string" && afterHeading.trim().length > 0
    ? afterHeading.trim()
    : undefined
}

export function useDatabaseEmbedAutoApply({
  enabled = true,
  messages,
}: UseDatabaseEmbedAutoApplyOptions) {
  const { getEditorHandle } = usePageEditorRegistry()
  const handledToolCallIds = useRef(new Set<string>())

  useEffect(() => {
    if (!enabled) {
      return
    }

    for (const message of messages) {
      if (message.role !== "assistant") {
        continue
      }

      for (const part of message.parts) {
        if (!isToolUIPart(part) || part.state !== "output-available") {
          continue
        }

        if (getToolName(part) !== EMBED_DATABASE_IN_PAGE_TOOL) {
          continue
        }

        if (handledToolCallIds.current.has(part.toolCallId)) {
          continue
        }

        const ids = readDatabaseConfigToolIds(part.output)
        const pageId = ids?.pageId
        const databaseId = ids?.databaseId

        if (!pageId || !databaseId) {
          continue
        }

        handledToolCallIds.current.add(part.toolCallId)

        const handle = getEditorHandle(pageId)

        if (!handle?.isEditable()) {
          continue
        }

        try {
          const currentContent = handle.getContentJson()
          const { content, alreadyEmbedded } = insertDatabaseBlockInContent(
            currentContent,
            {
              afterHeading: readEmbedAfterHeading(part.input),
              databaseId,
            },
          )

          if (!alreadyEmbedded) {
            handle.setContentJson(content)
          }
        } catch (error) {
          console.warn("Failed to apply database embed in editor", error)
        }
      }
    }
  }, [enabled, getEditorHandle, messages])
}