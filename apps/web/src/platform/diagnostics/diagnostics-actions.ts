import { invoke } from "@/platform/desktop/native"

export function openDesktopDiagnosticsFolder() {
  return invoke("open_diagnostics_folder")
}

export function exportDesktopDiagnostics() {
  return invoke<string>("export_diagnostics")
}
