export function hasPendingCollaborationChanges(
  collaboration: { unsyncedChanges: number } | null | undefined,
) {
  return Boolean(collaboration && collaboration.unsyncedChanges > 0);
}

export function canEditPageDuringConnection(input: {
  online: boolean;
  error: string | null;
  cacheError: Error | null;
  blocked: boolean;
  startupAllowed: boolean;
  status: CollaborationStatus;
  synced: boolean;
}) {
  return (
    input.online &&
    !input.error &&
    !input.cacheError &&
    !input.blocked &&
    input.status !== "blocked" &&
    (input.startupAllowed || (input.status === "connected" && input.synced))
  );
}
import type { CollaborationStatus } from "./collaboration-contracts";
