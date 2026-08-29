import { useEffect, useMemo, useState } from "react"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import type { SessionUser } from "@zilobase/features/auth"
import * as Y from "yjs"

import { collaborationColor } from "@/packages/editor/collaboration/color"
import { apiFetch } from "@/lib/api"
import {
  applyTicketState,
  connectLocalPageDocument,
  type CollaborationTicket,
} from "@/features/offline/index"

function getMeetingTicket(meetingId: string, signal?: AbortSignal) {
  return apiFetch<CollaborationTicket>(
    `/meetings/${meetingId}/collaboration-ticket`,
    { method: "POST", signal },
  )
}

export function useMeetingCollaboration(
  meetingId: string | null,
  user: SessionUser | null | undefined,
) {
  const [document, setDocument] = useState<Y.Doc | null>(null)
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null)
  const [status, setStatus] = useState<
    "connecting" | "connected" | "disconnected" | "blocked"
  >("disconnected")
  const [error, setError] = useState<string | null>(null)
  const [, setRevision] = useState(0)
  const collaborationUser = useMemo(
    () =>
      user
        ? {
            avatar: user.image,
            color: collaborationColor(user.id),
            id: user.id,
            name: user.name || user.email,
          }
        : undefined,
    [user?.email, user?.id, user?.image, user?.name],
  )

  useEffect(() => {
    if (!meetingId || !collaborationUser) return

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
          autoConnect: false,
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
        activeProvider.setAwarenessField("user", collaborationUser)
        setDocument(nextDocument)
        setProvider(activeProvider)
        void activeProvider.connect().catch(() => {
          if (!disposed) setStatus("disconnected")
        })
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
  }, [collaborationUser, meetingId])

  return { document, error, provider, status, user: collaborationUser }
}
