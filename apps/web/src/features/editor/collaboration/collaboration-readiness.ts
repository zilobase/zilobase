type PageCollaborationReadiness = {
  document: unknown | null
  error: string | null
  provider: unknown | null
  synced: boolean
}

export function isPageCollaborationReady(
  collaboration: PageCollaborationReadiness,
) {
  return Boolean(
    collaboration.document &&
      collaboration.provider &&
      collaboration.synced &&
      !collaboration.error,
  )
}

export function hasPendingCollaborationChanges(
  collaboration: { unsyncedChanges: number } | null | undefined,
) {
  return Boolean(collaboration && collaboration.unsyncedChanges > 0)
}
