export function hasPendingCollaborationChanges(
  collaboration: { unsyncedChanges: number } | null | undefined,
) {
  return Boolean(collaboration && collaboration.unsyncedChanges > 0)
}
