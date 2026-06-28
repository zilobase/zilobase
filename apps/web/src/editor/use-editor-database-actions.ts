import { useCallback } from "react"
import { useAddDatabaseRow, useCreateDatabase } from "@notelab/features/databases"
import { toast } from "sonner"
import { dropPageOnDatabase } from "./database-page-drag"

export const useEditorDatabaseActions = (
  workspaceId?: string | null,
  pageId?: string | null
) => {
  const createDatabase = useCreateDatabase()
  const addDatabaseRow = useAddDatabaseRow()

  const createEditorDatabase = useCallback(async () => {
    if (!workspaceId || !pageId) return null
    const payload = await createDatabase.mutateAsync({
      name: "New database",
      workspaceId,
      pageId: pageId,
    })
    return payload.database.id
  }, [createDatabase, workspaceId, pageId])

  const handleDatabasePageDrop = useCallback(
    (event: DragEvent) =>
      dropPageOnDatabase(event, {
        addDatabaseRow,
        onError: (message) => toast.error(message),
      }),
    [addDatabaseRow]
  )

  return { createEditorDatabase, handleDatabasePageDrop }
}
