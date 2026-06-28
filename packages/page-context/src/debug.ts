export type PageContextLogMeta = {
  primaryId?: string | null
  attachmentIds?: string[]
  charCount: number
  buildMs: number
  trimmedAttachmentIds?: string[]
}

function shouldLogPageContext() {
  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    return true
  }

  if (typeof localStorage === "undefined") {
    return false
  }

  return localStorage.getItem("notelabDebugAiContext") === "1"
}

export function logPageContext(
  markdown: string,
  meta: PageContextLogMeta,
) {
  if (!shouldLogPageContext()) {
    return
  }

  console.group("[Notelab AI Context]")
  console.log("meta:", meta)
  console.log(`markdown (${meta.charCount} chars):\n`, markdown)
  console.groupEnd()
}

export function logPageContextRebuild(meta: {
  attachmentCount: number
  charCount: number
  buildMs: number
}) {
  if (!shouldLogPageContext()) {
    return
  }

  console.log(
    `[Notelab AI Context] rebuilt (${meta.attachmentCount} attachments, ${meta.charCount} chars, ${meta.buildMs}ms)`,
  )
}

export function logPageContextSent(meta: {
  charCount: number
  attachmentCount: number
}) {
  if (!shouldLogPageContext()) {
    return
  }

  console.log("[Notelab AI Context] sent with message", meta)
}

export function warnPageContextTrimmed(droppedAttachmentIds: string[]) {
  if (!shouldLogPageContext()) {
    return
  }

  console.warn("[Notelab AI Context] trimmed attachments", {
    dropped: droppedAttachmentIds,
  })
}