export type PageEditLogMeta = Record<string, unknown>

function shouldLogPageEdit() {
  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    return true
  }

  if (typeof localStorage === "undefined") {
    return false
  }

  return localStorage.getItem("notelabDebugPageEdit") === "1"
}

export function logPageEdit(event: string, meta?: PageEditLogMeta) {
  if (!shouldLogPageEdit()) {
    return
  }

  if (meta) {
    console.log(`[Notelab Page Edit] ${event}`, meta)
    return
  }

  console.log(`[Notelab Page Edit] ${event}`)
}

export function warnPageEdit(event: string, meta?: PageEditLogMeta) {
  if (!shouldLogPageEdit()) {
    return
  }

  if (meta) {
    console.warn(`[Notelab Page Edit] ${event}`, meta)
    return
  }

  console.warn(`[Notelab Page Edit] ${event}`)
}