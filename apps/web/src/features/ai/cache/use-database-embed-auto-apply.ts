import { useEffect, useRef } from "react"
import { getToolName, isToolUIPart, type UIMessage } from "ai"

import { readDatabaseConfigToolIds } from "@zilobase/features/ai-chat"
import { insertDatabaseBlockInContent } from "@zilobase/page-context"

import {
  usePageEditorRegistry,
  usePageEditorRegistryVersion,
} from "@/features/editor/runtime/page-editor-registry"

const EMBED_DATABASE_IN_PAGE_TOOLS = new Set([
  "buildDatabaseFromBlueprint",
  "embedDatabaseInPage",
])

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

function readEmbedShowTitle(input: unknown, output: unknown) {
  if (output && typeof output === "object" && !Array.isArray(output)) {
    const data = (output as { data?: unknown }).data
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const showTitle = (data as { showInlineDatabaseTitle?: unknown })
        .showInlineDatabaseTitle
      if (typeof showTitle === "boolean") return showTitle
    }
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined
  }
  const showTitle = (input as { showTitle?: unknown }).showTitle
  return typeof showTitle === "boolean" ? showTitle : undefined
}

export function useDatabaseEmbedAutoApply({
  enabled = true,
  messages,
}: UseDatabaseEmbedAutoApplyOptions) {
  const { getEditorHandle } = usePageEditorRegistry()
  const editorRegistryVersion = usePageEditorRegistryVersion()
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

        if (!EMBED_DATABASE_IN_PAGE_TOOLS.has(getToolName(part))) {
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

        const handle = getEditorHandle(pageId)

        if (!handle?.isEditable()) {
          continue
        }

        try {
          const currentContent = handle.getContentJson()
          const { content, alreadyEmbedded, titleUpdated } =
            insertDatabaseBlockInContent(
              currentContent,
              {
                afterHeading: readEmbedAfterHeading(part.input),
                databaseId,
                showTitle: readEmbedShowTitle(part.input, part.output),
              },
            )

          if (
            (!alreadyEmbedded || titleUpdated) &&
            !handle.setContentJson(content)
          ) {
            continue
          }

          handledToolCallIds.current.add(part.toolCallId)
        } catch (error) {
          console.warn("Failed to apply database embed in editor", error)
        }
      }
    }
  }, [editorRegistryVersion, enabled, getEditorHandle, messages])
}
