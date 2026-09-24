export function calendarConnectionReturnPath(
  workspaceId: string,
  connection: "success" | "cancelled",
) {
  return `/calendar?${new URLSearchParams({ workspace: workspaceId, connection })}`;
}
