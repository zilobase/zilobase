import { invoke, isTauri } from "@tauri-apps/api/core"

export const DEFAULT_DESKTOP_TRANSLUCENCY = 0
export const MAX_DESKTOP_TRANSLUCENCY = 40
export const DESKTOP_TRANSLUCENCY_STORAGE_KEY =
  "zilobase.desktop.translucency"

export function normalizeDesktopTranslucency(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_DESKTOP_TRANSLUCENCY
  return Math.min(MAX_DESKTOP_TRANSLUCENCY, Math.max(0, Math.round(numeric)))
}

export function getDesktopTranslucency(): number {
  if (typeof window === "undefined") return DEFAULT_DESKTOP_TRANSLUCENCY

  try {
    return normalizeDesktopTranslucency(
      window.localStorage.getItem(DESKTOP_TRANSLUCENCY_STORAGE_KEY),
    )
  } catch {
    return DEFAULT_DESKTOP_TRANSLUCENCY
  }
}

export async function setDesktopTranslucency(value: number): Promise<number> {
  const translucency = normalizeDesktopTranslucency(value)

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        DESKTOP_TRANSLUCENCY_STORAGE_KEY,
        String(translucency),
      )
    } catch {
      // The live setting still works when browser storage is unavailable.
    }
  }

  if (isTauri()) {
    await invoke("set_window_opacity", {
      opacity: 1 - translucency / 100,
    })
  }

  return translucency
}

export async function initializeDesktopTranslucency(): Promise<void> {
  if (!isTauri()) return
  await setDesktopTranslucency(getDesktopTranslucency())
}
