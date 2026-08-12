export type PageEditLogMeta = Record<string, unknown>

declare const __DEV__: boolean

function shouldLogPageEdit() {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    return true
  }

  if (typeof localStorage === "undefined") {
    return false
  }

  return localStorage.getItem("zilobaseDebugPageEdit") === "1"
}

export function logPageEdit(event: string, meta?: PageEditLogMeta) {
  if (!shouldLogPageEdit()) {
    return
  }

  if (meta) {
    console.log(`[Zilobase Page Edit] ${event}`, meta)
    return
  }

  console.log(`[Zilobase Page Edit] ${event}`)
}

export function warnPageEdit(event: string, meta?: PageEditLogMeta) {
  if (!shouldLogPageEdit()) {
    return
  }

  if (meta) {
    console.warn(`[Zilobase Page Edit] ${event}`, meta)
    return
  }

  console.warn(`[Zilobase Page Edit] ${event}`)
}
