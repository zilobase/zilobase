import { useRestoreDatabase } from "@zilobase/features/databases/react"
import { toast } from "sonner"

import { TrashedItemBanner } from "@/features/pages/components/index"

export function DatabaseTrashBanner({
  databaseId,
  showRestore,
}: {
  databaseId: string
  showRestore: boolean
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
    <TrashedItemBanner
      itemLabel="database"
      onRestore={restoreTrashedDatabase}
      restoring={restoreDatabase.isPending}
      showRestore={showRestore}
    />
  )
}
