export type WorkspaceEditLogMeta = Record<string, unknown>

function shouldLogWorkspaceEdit() {
  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    return true
  }

  if (typeof localStorage === "undefined") {
    return false
  }

  return localStorage.getItem("notelabDebugWorkspaceEdit") === "1"
}

export function logWorkspaceEdit(event: string, meta?: WorkspaceEditLogMeta) {
  if (!shouldLogWorkspaceEdit()) {
    return
  }

  if (meta) {
    console.log(`[Notelab Workspace Edit] ${event}`, meta)
    return
  }

  console.log(`[Notelab Workspace Edit] ${event}`)
}

export function warnWorkspaceEdit(event: string, meta?: WorkspaceEditLogMeta) {
  if (!shouldLogWorkspaceEdit()) {
    return
  }

  if (meta) {
    console.warn(`[Notelab Workspace Edit] ${event}`, meta)
    return
  }

  console.warn(`[Notelab Workspace Edit] ${event}`)
}