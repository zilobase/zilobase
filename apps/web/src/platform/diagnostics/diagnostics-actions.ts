import { desktopBridge } from "@/platform/desktop/native"

export function openDesktopDiagnosticsFolder() {
  return desktopBridge().diagnostics.openFolder()
}

export function exportDesktopDiagnostics() {
  return desktopBridge().diagnostics.export()
}
