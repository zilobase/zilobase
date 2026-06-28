import { useEffect, useRef, useState } from "react"
import {
  getToolName,
  isToolUIPart,
  type UIMessage,
} from "ai"

import {
  buildPageEditSnapshotMap,
  dedupeChatMessagesById,
  isProposePageContentUpdateToolName,
  isStalePageEditResolveError,
  type ProposePageContentUpdateOutput,
  type PageEditSnapshotPart,
  WORKSPACE_EDIT_SNAPSHOT_PART_TYPE,
} from "@notelab/features/ai-chat"
import { prosemirrorToMarkdown } from "@notelab/page-context"

import { usePageEditorRegistry } from "@/contexts/page-editor-registry"
import { usePageEditApplier } from "@/hooks/use-page-edit-applier"
import {
  logPageEdit,
  warnPageEdit,
} from "@notelab/features/ai-chat"

type UsePageEditAutoApplyOptions = {
  enabled?: boolean
  getContextPageMarkdown?: (pageId: string) => string | null
  messages: UIMessage[]
  setMessages: (messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => void
}

function buildSnapshotMessage(snapshotPart: PageEditSnapshotPart) {
  return {
    id: crypto.randomUUID(),
    role: "data",
    parts: [snapshotPart],
  } as unknown as UIMessage
}

function upsertSnapshotMessage(
  messages: UIMessage[],
  snapshotPart: PageEditSnapshotPart,
) {
  const existingIndex = messages.findIndex(
    (entry) =>
      (entry.role as string) === "data" &&
      entry.parts.some((entryPart) => {
        const snapshot = entryPart as unknown as PageEditSnapshotPart
        return (
          snapshot.type === WORKSPACE_EDIT_SNAPSHOT_PART_TYPE &&
          snapshot.toolCallId === snapshotPart.toolCallId
        )
      }),
  )

  if (existingIndex === -1) {
    return dedupeChatMessagesById([
      ...messages,
      buildSnapshotMessage(snapshotPart),
    ])
  }

  return dedupeChatMessagesById(
    messages.map((entry, index) => {
      if (index !== existingIndex) {
        return entry
      }

      return {
        ...entry,
        parts: [snapshotPart],
      } as unknown as UIMessage
    }),
  )
}

function readEditorSnapshotState(pageId: string, getEditorHandle: ReturnType<
  typeof usePageEditorRegistry
>["getEditorHandle"]) {
  const beforeContentJson = getEditorHandle(pageId)?.getContentJson() ?? null

  return {
    beforeContentJson,
    beforeMarkdown: beforeContentJson
      ? prosemirrorToMarkdown(beforeContentJson)
      : "",
  }
}

export function usePageEditAutoApply({
  enabled = true,
  getContextPageMarkdown,
  messages,
  setMessages,
}: UsePageEditAutoApplyOptions) {
  const { getEditorHandle } = usePageEditorRegistry()
  const { resolvePageEdit } = usePageEditApplier()
  const processedToolCallIdsRef = useRef(new Set<string>())
  const [applyingToolCallIds, setApplyingToolCallIds] = useState<string[]>([])

  useEffect(() => {
    for (const message of messages) {
      if ((message.role as string) !== "data") {
        continue
      }

      for (const part of message.parts) {
        const snapshotPart = part as unknown as PageEditSnapshotPart

        if (
          snapshotPart.type === WORKSPACE_EDIT_SNAPSHOT_PART_TYPE &&
          typeof snapshotPart.toolCallId === "string"
        ) {
          processedToolCallIdsRef.current.add(snapshotPart.toolCallId)
        }
      }
    }
  }, [messages])

  useEffect(() => {
    if (!enabled) {
      logPageEdit("autoApply:disabled")
      return
    }

    const snapshotByToolCallId = buildPageEditSnapshotMap(messages)

    for (const message of messages) {
      if (message.role !== "assistant") {
        continue
      }

      for (const part of message.parts) {
        if (!isToolUIPart(part)) {
          continue
        }

        const toolName = getToolName(part)

        if (!isProposePageContentUpdateToolName(toolName)) {
          continue
        }

        if (part.state === "output-error" || part.errorText) {
          warnPageEdit("autoApply:tool-error", {
            errorText: part.errorText,
            input: part.input,
            toolCallId: part.toolCallId,
          })
          continue
        }

        if (part.state !== "output-available") {
          continue
        }

        const toolCallId = part.toolCallId

        if (
          processedToolCallIdsRef.current.has(toolCallId) ||
          snapshotByToolCallId.has(toolCallId)
        ) {
          processedToolCallIdsRef.current.add(toolCallId)
          continue
        }

        processedToolCallIdsRef.current.add(toolCallId)

        const output = part.output as ProposePageContentUpdateOutput | undefined

        if (!output?.pageId) {
          warnPageEdit("autoApply:missing-output", {
            output,
            toolCallId,
          })
          continue
        }

        const editMode =
          output.editMode ??
          (output.searchText ? "patch" : output.afterMarkdown ? "full" : null)

        if (!editMode) {
          warnPageEdit("autoApply:missing-edit-mode", {
            output,
            toolCallId,
          })
          continue
        }

        if (
          editMode === "full" &&
          (!output.afterMarkdown || !output.afterMarkdown.trim())
        ) {
          warnPageEdit("autoApply:missing-full-output", {
            output,
            toolCallId,
          })
          continue
        }

        if (
          editMode === "patch" &&
          (!output.searchText || !output.searchText.trim())
        ) {
          warnPageEdit("autoApply:missing-patch-output", {
            output,
            toolCallId,
          })
          continue
        }

        logPageEdit("autoApply:tool-output", {
          editMode,
          summary: output.summary,
          toolCallId,
          pageId: output.pageId,
        })

        setApplyingToolCallIds((current) =>
          current.includes(toolCallId) ? current : [...current, toolCallId],
        )

        const resolveResult = resolvePageEdit({
          afterMarkdown: output.afterMarkdown,
          contextPageMarkdown: getContextPageMarkdown?.(output.pageId) ?? null,
          editMode,
          replaceText: output.replaceText,
          searchText: output.searchText,
          pageId: output.pageId,
        })

        if (resolveResult.success) {
          logPageEdit("autoApply:snapshot-ready", {
            toolCallId,
            pageId: output.pageId,
          })
        } else {
          warnPageEdit("autoApply:snapshot-failed", {
            errorMessage: resolveResult.errorMessage,
            toolCallId,
            pageId: output.pageId,
          })
        }

        const snapshotPart: PageEditSnapshotPart = resolveResult.success
          ? {
              type: WORKSPACE_EDIT_SNAPSHOT_PART_TYPE,
              toolCallId,
              parentMessageId: message.id,
              pageId: output.pageId,
              summary: output.summary,
              beforeMarkdown: resolveResult.beforeMarkdown,
              afterMarkdown: resolveResult.afterMarkdown,
              beforeContentJson: resolveResult.beforeContentJson,
              status: "preview",
              appliedAt: new Date().toISOString(),
            }
          : isStalePageEditResolveError(resolveResult.errorMessage)
            ? {
                type: WORKSPACE_EDIT_SNAPSHOT_PART_TYPE,
                toolCallId,
                parentMessageId: message.id,
                pageId: output.pageId,
                summary: output.summary,
                ...readEditorSnapshotState(output.pageId, getEditorHandle),
                afterMarkdown: output.afterMarkdown?.trim() ?? "",
                status: "declined",
                appliedAt: new Date().toISOString(),
              }
            : {
                type: WORKSPACE_EDIT_SNAPSHOT_PART_TYPE,
                toolCallId,
                parentMessageId: message.id,
                pageId: output.pageId,
                summary: output.summary,
                beforeMarkdown: "",
                afterMarkdown:
                  output.afterMarkdown ??
                  output.replaceText ??
                  "",
                beforeContentJson: null,
                status: "failed",
                appliedAt: new Date().toISOString(),
                errorMessage: resolveResult.errorMessage,
              }

        setApplyingToolCallIds((current) =>
          current.filter((entry) => entry !== toolCallId),
        )

        setMessages((currentMessages) =>
          upsertSnapshotMessage(currentMessages, snapshotPart),
        )
      }
    }
  }, [
    enabled,
    getContextPageMarkdown,
    getEditorHandle,
    messages,
    resolvePageEdit,
    setMessages,
  ])

  return {
    applyingToolCallIds,
  }
}

export function updatePageEditSnapshotStatus(
  messages: UIMessage[],
  toolCallId: string,
  status: PageEditSnapshotPart["status"],
  options?: {
    afterContentJson?: unknown
  },
) {
  return dedupeChatMessagesById(
    messages.map((message) => {
      if ((message.role as string) !== "data") {
        return message
      }

      return {
        ...message,
        parts: message.parts.map((part) => {
          const snapshot = part as unknown as PageEditSnapshotPart

          if (
            snapshot.type !== WORKSPACE_EDIT_SNAPSHOT_PART_TYPE ||
            snapshot.toolCallId !== toolCallId
          ) {
            return part
          }

          return {
            ...snapshot,
            status,
            afterContentJson:
              options?.afterContentJson ?? snapshot.afterContentJson,
            appliedAt:
              status === "applied"
                ? new Date().toISOString()
                : snapshot.appliedAt,
            undoneAt:
              status === "undone"
                ? new Date().toISOString()
                : snapshot.undoneAt,
          } as unknown as typeof part
        }),
      }
    }),
  )
}