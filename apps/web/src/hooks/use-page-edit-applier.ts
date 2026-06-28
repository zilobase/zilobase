import { useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { MutableRefObject } from "react"

import { usePageEditorRegistry } from "@/contexts/page-editor-registry"
import type { Content, Editor } from "@tiptap/core"

import type { PageEditorHandle } from "@/contexts/page-editor-registry"
import { parseMarkdownContent } from "@/editor/editor-ai-utils"
import type { PageEditPreviewControls } from "@/editor/types"
import { useNotelabFeatures } from "@notelab/features"
import { pageQueryKey, type PageDetail } from "@notelab/features/pages"
import {
  logPageEdit,
  resolvePageEditMarkdown,
  warnPageEdit,
  type ProposePageContentUpdateOutput,
} from "@notelab/features/ai-chat"
import { prosemirrorToMarkdown } from "@notelab/page-context"

type ResolvePageEditInput = Pick<
  ProposePageContentUpdateOutput,
  | "afterMarkdown"
  | "editMode"
  | "replaceText"
  | "searchText"
  | "pageId"
> & {
  contextPageMarkdown?: string | null
}

type ResolvePageEditResult =
  | {
      afterMarkdown: string
      beforeContentJson: unknown
      beforeMarkdown: string
      success: true
    }
  | {
      errorMessage: string
      success: false
    }

type CommitPageEditResult =
  | { success: true }
  | {
      errorMessage: string
      success: false
    }

export function usePageEditApplier() {
  const { getEditorHandle } = usePageEditorRegistry()
  const { apiFetch } = useNotelabFeatures()
  const queryClient = useQueryClient()

  const resolvePageEdit = useCallback(
    (input: ResolvePageEditInput): ResolvePageEditResult => {
      logPageEdit("resolvePageEdit:start", {
        editMode: input.editMode,
        pageId: input.pageId,
      })

      const handle = getEditorHandle(input.pageId)

      if (!handle) {
        warnPageEdit("resolvePageEdit:no-editor-handle", {
          pageId: input.pageId,
        })
        return {
          errorMessage:
            "Open the target page in the editor before applying this change.",
          success: false,
        }
      }

      if (!handle.isEditable()) {
        warnPageEdit("resolvePageEdit:not-editable", {
          pageId: input.pageId,
        })
        return {
          errorMessage: "You do not have permission to edit this page.",
          success: false,
        }
      }

      const beforeContentJson = handle.getContentJson()

      if (beforeContentJson == null) {
        warnPageEdit("resolvePageEdit:empty-content", {
          pageId: input.pageId,
        })
        return {
          errorMessage: "The page editor is not ready yet.",
          success: false,
        }
      }

      const beforeMarkdown = prosemirrorToMarkdown(beforeContentJson)
      const resolved = resolvePageEditMarkdown({
        afterMarkdown: input.afterMarkdown,
        beforeMarkdown,
        contextPageMarkdown: input.contextPageMarkdown,
        editMode: input.editMode,
        replaceText: input.replaceText,
        searchText: input.searchText,
      })

      if (!resolved.success) {
        warnPageEdit("resolvePageEdit:resolve-failed", {
          contextChars: input.contextPageMarkdown?.length ?? 0,
          editMode: input.editMode,
          editorChars: beforeMarkdown.length,
          errorMessage: resolved.errorMessage,
          searchPreview: input.searchText?.slice(0, 160) ?? "",
          pageId: input.pageId,
        })
        return {
          errorMessage: resolved.errorMessage,
          success: false,
        }
      }

      logPageEdit("resolvePageEdit:success", {
        afterChars: resolved.afterMarkdown.length,
        beforeChars: beforeMarkdown.length,
        editMode: input.editMode,
        patchSource: "patchSource" in resolved ? resolved.patchSource : "full",
        pageId: input.pageId,
      })

      return {
        afterMarkdown: resolved.afterMarkdown,
        beforeContentJson,
        beforeMarkdown,
        success: true,
      }
    },
    [getEditorHandle],
  )

  const commitPageEdit = useCallback(
    (input: {
      afterMarkdown: string
      pageId: string
    }): CommitPageEditResult => {
      const handle = getEditorHandle(input.pageId)

      if (!handle?.isEditable()) {
        return {
          errorMessage: "You do not have permission to edit this page.",
          success: false,
        }
      }

      if (!handle.setContentFromMarkdown(input.afterMarkdown)) {
        return {
          errorMessage: "The AI update could not be parsed into page content.",
          success: false,
        }
      }

      logPageEdit("commitPageEdit:success", {
        pageId: input.pageId,
      })

      return { success: true }
    },
    [getEditorHandle],
  )

  const undoPageEdit = useCallback(
    async (input: {
      beforeContentJson: unknown
      pageId: string
    }) => {
      const handle = getEditorHandle(input.pageId)

      if (handle?.isEditable()) {
        if (!handle.setContentJson(input.beforeContentJson)) {
          return {
            errorMessage: "The page editor could not restore the previous version.",
            success: false as const,
          }
        }

        return { success: true as const }
      }

      const workspaceId = readWorkspaceIdFromPageDetail(
        queryClient.getQueryData<PageDetail | null>(
          pageQueryKey(input.pageId),
        ),
      )

      if (!workspaceId) {
        return {
          errorMessage:
            "Open the page or reload it before undoing this change.",
          success: false as const,
        }
      }

      await apiFetch(`/api/pages/${encodeURIComponent(input.pageId)}`, {
        body: JSON.stringify({ content: input.beforeContentJson }),
        headers: {
          "Content-Type": "application/json",
          "x-notelab-workspace-id": workspaceId,
        },
        method: "PATCH",
      })

      return { success: true as const }
    },
    [apiFetch, getEditorHandle, queryClient],
  )

  return {
    commitPageEdit,
    resolvePageEdit,
    undoPageEdit,
  }
}

function readWorkspaceIdFromPageDetail(detail: PageDetail | null | undefined) {
  return detail?.page?.workspaceId ?? null
}

export function createPageEditorHandle(input: {
  editable: boolean
  getEditor: () => Editor | null
  onContentChange?: (content: unknown) => void
  pageEditPreviewRef?: MutableRefObject<PageEditPreviewControls | null>
}): PageEditorHandle {
  const applyContent = (content: unknown) => {
    const editor = input.getEditor()

    if (!editor || !input.editable) {
      return false
    }

    editor.commands.setContent(content as Content)
    input.onContentChange?.(editor.getJSON())
    return true
  }

  const getPreviewControls = () => input.pageEditPreviewRef?.current ?? null

  return {
    acceptEditDiffPreview: () => getPreviewControls()?.accept() ?? false,
    clearEditDiffPreview: (options) => {
      getPreviewControls()?.clear(options)
    },
    getActiveEditDiffToolCallId: () => getPreviewControls()?.toolCallId() ?? null,
    getContentJson: () => input.getEditor()?.getJSON() ?? null,
    isEditDiffPreviewActive: () => getPreviewControls()?.isActive() ?? false,
    isEditable: () => input.editable,
    setContentFromMarkdown: (markdown) => {
      const editor = input.getEditor()

      if (!editor || !input.editable) {
        return false
      }

      const parsed = parseMarkdownContent(editor, markdown, {
        unwrapPlainFencedBlock: true,
      })

      if (!parsed) {
        return false
      }

      return applyContent({
        type: "doc",
        content: parsed.content,
      })
    },
    setContentJson: (content) => applyContent(content),
    showEditDiffPreview: (request) => getPreviewControls()?.show(request) ?? false,
  }
}