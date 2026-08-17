import { useEffect, useState } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

type CaptureStatus = {
  checkpointPath: string | null
  elapsedMs: number
  error: string | null
  meetingId: string | null
  phase: "idle" | "starting" | "recording" | "paused" | "stopped" | "error"
  sampleRate: number
}

export type RecoverableMeetingCapture = {
  audioPath: string
  elapsedMs: number
  meetingId: string
  sampleRate: number
  startedAtEpochMs: number
}

export function useNativeMeetingCapture(meetingId: string) {
  const [level, setLevel] = useState(0)
  const [status, setStatus] = useState<CaptureStatus | null>(null)
  const [recovery, setRecovery] = useState<RecoverableMeetingCapture | null>(null)

  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    const unlisteners: Array<() => void> = []

    void invoke<CaptureStatus>("meeting_capture_state").then((value) => {
      if (!cancelled && value.meetingId === meetingId) setStatus(value)
    })
    const loadRecovery = () => invoke<RecoverableMeetingCapture[]>(
      "meeting_capture_recoverable_sessions",
    ).then((sessions) => {
      if (!cancelled) {
        setRecovery(sessions.find((session) => session.meetingId === meetingId) ?? null)
      }
    })
    void loadRecovery()
    void listen<CaptureStatus>("meeting-capture-state", ({ payload }) => {
      if (payload.meetingId === meetingId) {
        setStatus(payload)
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

    return () => {
      cancelled = true
      unlisteners.forEach((unlisten) => unlisten())
    }
  }, [meetingId])

  return { level, recovery, status }
}
