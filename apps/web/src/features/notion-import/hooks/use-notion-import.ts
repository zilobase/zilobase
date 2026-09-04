import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import {
  importNotionZipFile,
  NotionImportError,
} from "@/features/notion-import/lib/notion-import"
import {
  useCreatePage,
  useUpdatePage,
} from "@zilobase/features/pages"
import posthog from "@/shared/lib/posthog"

export function useNotionImport({
  navigateToEntry = true,
  workspaceId,
}: {
  navigateToEntry?: boolean
  workspaceId: string | null | undefined
}) {
  const navigate = useNavigate()
  const createPage = useCreatePage()
  const updatePage = useUpdatePage()
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const [isImporting, setIsImporting] = React.useState(false)

  const openImportPicker = React.useCallback(() => {
    inputRef.current?.click()
  }, [])

  const handleImportFile = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ""

      if (!file) {
        return
      }

      if (!workspaceId) {
        toast.error("Select a workspace before importing Notion pages.")
        return
      }

      const toastId = toast.loading("Importing Notion pages...")

      setIsImporting(true)

      try {
        const result = await importNotionZipFile({
          createPage: (input) => createPage.mutateAsync(input),
          file,
          updatePage: (input) => updatePage.mutateAsync(input),
          workspaceId,
        })
        posthog?.capture("notion_import_completed", {
          imported_page_count: result.createdPageIds.length,
          skipped_asset_count: result.skippedAssets,
        })
        const suffix =
          result.skippedAssets > 0
            ? ` ${result.skippedAssets} asset${result.skippedAssets === 1 ? "" : "s"} skipped.`
            : ""

        toast.success(
          `Imported ${result.createdPageIds.length} Notion page${result.createdPageIds.length === 1 ? "" : "s"}.${suffix}`,
          { id: toastId },
        )

        if (navigateToEntry && result.entryPageId) {
          await navigate({
            to: "/p/$pageId",
            params: { pageId: result.entryPageId },
          })
        }
      } catch (error) {
        toast.error(
          error instanceof NotionImportError || error instanceof Error
            ? error.message
            : "Could not import Notion pages.",
          { id: toastId },
        )
      } finally {
        setIsImporting(false)
      }
    },
    [createPage, navigate, navigateToEntry, updatePage, workspaceId],
  )

  return {
    handleImportFile,
    inputRef,
    isImporting,
    openImportPicker,
  }
}
