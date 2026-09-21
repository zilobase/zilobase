import { useRestoreDatabase } from "@zilobase/features/databases/react"
import { toast } from "sonner"

import { Loader2 } from "@/shared/components/icons"
import { Button } from "@/shared/ui/button"

export function DatabaseTrashRestoreButton({
  databaseId,
}: {
  databaseId: string
}) {
  const restoreDatabase = useRestoreDatabase()

  const restoreTrashedDatabase = () => {
    if (restoreDatabase.isPending) return

    restoreDatabase.mutate(databaseId, {
      onSuccess: () => {
        toast.success("Database restored.")
      },
      onError: (error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not restore database.",
        )
      },
    })
  }

  return (
    <Button
      aria-label="Restore database"
      className="database-new-button"
      disabled={restoreDatabase.isPending}
      onClick={restoreTrashedDatabase}
      type="button"
    >
      {restoreDatabase.isPending ? <Loader2 className="animate-spin" /> : null}
      <span>{restoreDatabase.isPending ? "Restoring" : "Restore"}</span>
    </Button>
  )
}
