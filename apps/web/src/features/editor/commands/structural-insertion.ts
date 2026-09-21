export type StructuralInsertionPendingChange = (pending: boolean) => void

export async function runStructuralInsertion<T>({
  create,
  insert,
  onPendingChange,
}: {
  create: (() => Promise<T | null>) | undefined
  insert: (created: T) => void
  onPendingChange?: StructuralInsertionPendingChange
}) {
  if (!create) {
    return null
  }

  onPendingChange?.(true)

  try {
    const created = await create()

    if (created !== null) {
      insert(created)
    }

    return created
  } finally {
    onPendingChange?.(false)
  }
}
