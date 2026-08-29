import { useCallback, useEffect, useState } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

import { BrowserMeetingCapture } from "@/features/meetings/capture/index"
import type {
  MeetingAudioDevice,
  MeetingCaptureController,
  MeetingCaptureStartConfig,
  MeetingCaptureStatus,
  MeetingTranscriptDraft,
  RecoverableMeetingCapture,
} from "@/features/meetings/capture/index"

const browserCapture = new BrowserMeetingCapture()

export function useMeetingCapture(meetingId: string): MeetingCaptureController {
  const [level, setLevel] = useState(0)
  const [devices, setDevices] = useState<MeetingAudioDevice[]>([])
  const [status, setStatus] = useState<MeetingCaptureStatus | null>(null)
  const [liveTranscripts, setLiveTranscripts] = useState<
    MeetingTranscriptDraft[] | undefined
  >(undefined)
  const [recovery, setRecovery] = useState<RecoverableMeetingCapture | null>(null)
  const native = isTauri()

  useEffect(() => {
    let cancelled = false
    const unlisteners: Array<() => void> = []

    if (!native) {
      const sync = () => {
        if (cancelled) return
        setLevel(browserCapture.level)
        setLiveTranscripts(browserCapture.liveTranscripts?.filter(
          (draft) => draft.meetingId === meetingId,
        ))
        setStatus(browserCapture.status?.meetingId === meetingId ? browserCapture.status : null)
        setRecovery(browserCapture.recovery?.meetingId === meetingId
          ? browserCapture.recovery
          : null)
      }
      unlisteners.push(browserCapture.subscribe(sync))
      void browserCapture.listDevices().then((value) => {
        if (!cancelled) setDevices(value)
      })
      void browserCapture.loadRecovery(meetingId)
      sync()
      return () => {
        cancelled = true
        unlisteners.forEach((unlisten) => unlisten())
      }
    }

    void invoke<MeetingCaptureStatus>("meeting_capture_state").then((value) => {
      if (!cancelled && value.meetingId === meetingId) setStatus(value)
    })
    void invoke<MeetingAudioDevice[]>("meeting_capture_list_devices")
      .then((value) => {
        if (!cancelled) setDevices(value)
      })
      .catch(() => undefined)
    const loadRecovery = () => invoke<RecoverableMeetingCapture[]>(
      "meeting_capture_recoverable_sessions",
    ).then((sessions) => {
      if (!cancelled) {
        setRecovery(sessions.find((session) => session.meetingId === meetingId) ?? null)
      }
    })
    void loadRecovery()
    void listen<MeetingCaptureStatus>("meeting-capture-state", ({ payload }) => {
      if (payload.meetingId === meetingId) {
        setStatus(payload)
        if (payload.phase === "stopped") setLiveTranscripts([])
        if (payload.phase === "stopped") void loadRecovery()
      }
    }).then((unlisten) => {
      if (cancelled) unlisten()
      else unlisteners.push(unlisten)
    })
    void listen<{ peak: number; rms: number }>("meeting-capture-level", ({ payload }) => {
      setLevel(Math.min(1, Math.max(payload.rms * 4, payload.peak)))
    }).then((unlisten) => {
      if (cancelled) unlisten()
      else unlisteners.push(unlisten)
    })
    void listen<{ message?: string }>("meeting-capture-warning", ({ payload }) => {
      if (!payload.message) return
      setStatus((current) => current?.meetingId === meetingId
        ? {
            ...current,
            warnings: current.warnings?.includes(payload.message!)
              ? current.warnings
              : [...(current.warnings ?? []), payload.message!],
          }
        : current)
    }).then((unlisten) => {
      if (cancelled) unlisten()
      else unlisteners.push(unlisten)
    })
    void listen<MeetingTranscriptDraft | null>(
      "meeting-capture-transcript",
      ({ payload }) => {
        if (payload === null) {
          setLiveTranscripts([])
          return
        }
        if (payload.meetingId !== meetingId) return
        setLiveTranscripts((current) => {
          const next = (current ?? []).filter(
            (draft) => draft.source !== payload.source,
          )
          if (payload.text) next.push(payload)
          return next
        })
      },
    ).then((unlisten) => {
      if (cancelled) unlisten()
      else unlisteners.push(unlisten)
    })

    return () => {
      cancelled = true
      unlisteners.forEach((unlisten) => unlisten())
    }
  }, [meetingId, native])

  const start = useCallback(async (config: MeetingCaptureStartConfig) => {
    if (!native) return browserCapture.start(config)
    return invoke<MeetingCaptureStatus>("meeting_capture_start", { config })
  }, [native])
  const prepare = useCallback((config: Parameters<MeetingCaptureController["prepare"]>[0]) => native
    ? Promise.resolve()
    : browserCapture.prepare(config), [native])
  const cancelPreparation = useCallback(() => native
    ? Promise.resolve()
    : browserCapture.cancelPreparation(), [native])
  const pause = useCallback(() => native
    ? invoke<MeetingCaptureStatus>("meeting_capture_pause")
    : browserCapture.pause(), [native])
  const resume = useCallback(() => native
    ? invoke<MeetingCaptureStatus>("meeting_capture_resume")
    : browserCapture.resume(), [native])
  const stop = useCallback(() => native
    ? invoke<MeetingCaptureStatus>("meeting_capture_stop")
    : browserCapture.stop(), [native])
  const refreshTransport = useCallback((audioWebsocketUrl: string, audioTicket: string) => native
    ? invoke<void>("meeting_capture_refresh_transport", { audioTicket, audioWebsocketUrl })
    : browserCapture.refreshTransport(audioWebsocketUrl, audioTicket), [native])
  const deleteLocalFile = useCallback(() => native
    ? invoke<void>("meeting_capture_delete_local_file", { meetingId })
    : browserCapture.deleteLocalFile(meetingId), [meetingId, native])
  const openLocalFile = useCallback(() => native
    ? invoke<void>("meeting_capture_open_local_file", { meetingId })
    : browserCapture.openLocalFile(meetingId), [meetingId, native])

  return {
    cancelPreparation,
    deleteLocalFile,
    devices,
    level,
    liveTranscripts,
    openLocalFile,
    pause,
    prepare,
    recovery,
    refreshTransport,
    resume,
    start,
    status,
    stop,
  }
}
