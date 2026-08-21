import { useEffect, useState } from "react"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import * as Y from "yjs"

import { apiFetch } from "@/lib/api"
import {
  applyTicketState,
  connectLocalPageDocument,
  type CollaborationTicket,
} from "@/lib/offline-documents"

function getMeetingTicket(meetingId: string, signal?: AbortSignal) {
  return apiFetch<CollaborationTicket>(
    `/meetings/${meetingId}/collaboration-ticket`,
    { method: "POST", signal },
  )
}

export function useMeetingCollaboration(meetingId: string | null) {
  const [document, setDocument] = useState<Y.Doc | null>(null)
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null)
  const [status, setStatus] = useState<
    "connecting" | "connected" | "disconnected" | "blocked"
  >("disconnected")
  const [error, setError] = useState<string | null>(null)
  const [, setRevision] = useState(0)

  useEffect(() => {
    if (!meetingId) return

    const controller = new AbortController()
    const nextDocument = new Y.Doc()
    const handleDocumentUpdate = () => setRevision((current) => current + 1)
    nextDocument.on("update", handleDocumentUpdate)
    let activeProvider: HocuspocusProvider | null = null
    let disposed = false
    setStatus("connecting")
    setError(null)

    void getMeetingTicket(meetingId, controller.signal)
      .then((ticket) => {
        if (disposed) return
        applyTicketState(nextDocument, ticket)
        activeProvider = connectLocalPageDocument({
          document: nextDocument,
          onAuthenticationFailed: (reason) => {
            if (!disposed) {
              setStatus("blocked")
              setError(reason)
            }
          },
          onStatus: (nextStatus) => {
            if (!disposed) setStatus(nextStatus)
          },
          pageId: meetingId,
          refreshTicket: () => getMeetingTicket(meetingId),
          ticket,
        })
        setDocument(nextDocument)
        setProvider(activeProvider)
      })
      .catch((reason: unknown) => {
        if (disposed || controller.signal.aborted) return
        setStatus("disconnected")
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not connect meeting content.",
        )
      })

    return () => {
      disposed = true
      controller.abort()
      activeProvider?.destroy()
      nextDocument.off("update", handleDocumentUpdate)
      nextDocument.destroy()
      setDocument(null)
      setProvider(null)
    }
  }, [meetingId])

  return { document, error, provider, status }
}
