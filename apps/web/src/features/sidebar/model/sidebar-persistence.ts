export function readActiveSidebarTab(workspaceId: string | null) {
  try {
    return (
      window.localStorage.getItem(activeTabStorageKey(workspaceId)) ?? "home"
    );
  } catch {
    return "home";
  }
}

export function writeActiveSidebarTab(
  workspaceId: string | null,
  tabId: string,
) {
  try {
    window.localStorage.setItem(activeTabStorageKey(workspaceId), tabId);
  } catch {
    // Selection still works for this session.
  }
}

function activeTabStorageKey(workspaceId: string | null) {
  return `zilobase:sidebar-active-tab:${workspaceId ?? "default"}`;
}
