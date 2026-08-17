import { useEffect, useState } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import {
  CalendarDays,
  ChevronDown,
  CircleStop,
  Download,
  FileAudio,
  FolderOpen,
  LoaderCircle,
  Mic,
  MoreHorizontal,
  Pause,
  Play,
  Settings2,
  Sparkles,
} from "lucide-react"
import {
  useMeeting,
  useMeetingLifecycle,
  useMeetingRecorder,
  useMeetingTranscript,
  useUpdateMeeting,
  type MeetingLifecycleAction,
} from "@zilobase/features/meetings"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { MeetingCollaborativeEditor } from "./meeting-collaborative-editor"
import { useMeetingCollaboration } from "./use-meeting-collaboration"
import { useNativeMeetingCapture } from "./use-native-meeting-capture"

type MeetingTab = "summary" | "notes" | "transcript"

export function MeetingView({
  editable,
  meetingId,
}: {
  editable: boolean
  meetingId: string
}) {
  const meetingQuery = useMeeting(meetingId)
  const updateMeeting = useUpdateMeeting(meetingId)
  const lifecycle = useMeetingLifecycle(meetingId)
  const recorder = useMeetingRecorder(meetingId)
  const collaboration = useMeetingCollaboration(meetingId)
  const nativeCapture = useNativeMeetingCapture(meetingId)
  const [activeTab, setActiveTab] = useState<MeetingTab>("notes")
  const [title, setTitle] = useState("Meeting")
  const [leaseId, setLeaseId] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : window.sessionStorage.getItem(`zilobase:meeting-recorder:${meetingId}`),
  )
  const meeting = meetingQuery.data?.meeting
  const activeRecording = meeting?.status === "recording" || meeting?.status === "paused"
  const transcript = useMeetingTranscript(
    meetingId,
    activeRecording || meeting?.status === "processing",
  )

  useEffect(() => {
    if (meeting?.title) setTitle(meeting.title)
  }, [meeting?.title])

  useEffect(() => {
    if (!leaseId || !activeRecording) return
    const interval = window.setInterval(() => {
      void recorder.heartbeat.mutateAsync(leaseId).then((ticket) =>
        invoke("meeting_capture_refresh_transport", {
          audioTicket: ticket.token,
          audioWebsocketUrl: ticket.websocketUrl,
        }),
      ).catch(() => undefined)
    }, 10_000)
    return () => window.clearInterval(interval)
  }, [activeRecording, leaseId])

  const runLifecycle = async (action: MeetingLifecycleAction) => {
    try {
      if (action === "start") {
        if (!isTauri()) throw new Error("Meeting recording is available in the desktop app.")
        const claim = await recorder.claim.mutateAsync()
        setLeaseId(claim.leaseId)
        window.sessionStorage.setItem(
          `zilobase:meeting-recorder:${meetingId}`,
          claim.leaseId,
        )
        try {
          await invoke("meeting_capture_start", {
            config: {
              audioTicket: claim.token,
              audioWebsocketUrl: claim.websocketUrl,
              captureMicrophone: true,
              captureSystemAudio: false,
              meetingId,
            },
          })
          await lifecycle.mutateAsync({ action })
        } catch (error) {
          await invoke("meeting_capture_stop").catch(() => undefined)
          await recorder.release.mutateAsync(claim.leaseId).catch(() => undefined)
          setLeaseId(null)
          window.sessionStorage.removeItem(`zilobase:meeting-recorder:${meetingId}`)
          throw error
        }
        return
      }

      if (!isTauri()) throw new Error("Recorder controls are available in the desktop app.")
      if (action === "pause") await invoke("meeting_capture_pause")
      if (action === "resume") await invoke("meeting_capture_resume")
      if (action === "stop") {
        const capture = await invoke<{ elapsedMs: number }>("meeting_capture_stop")
        await lifecycle.mutateAsync({ action, durationMs: capture.elapsedMs })
        if (leaseId) await recorder.release.mutateAsync(leaseId)
        setLeaseId(null)
        window.sessionStorage.removeItem(`zilobase:meeting-recorder:${meetingId}`)
        return
      }
      await lifecycle.mutateAsync({ action })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Meeting update failed.")
    }
  }

  if (meetingQuery.isLoading) {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-xl border bg-card/50">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!meeting) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {meetingQuery.error instanceof Error
          ? meetingQuery.error.message
          : "This meeting is unavailable."}
      </div>
    )
  }

  const hasResult = meeting.status === "completed" || meeting.status === "failed"
  const tabs: MeetingTab[] = hasResult
    || activeRecording
    || meeting.status === "processing"
    || Boolean(transcript.data?.segments.length)
    ? ["summary", "notes", "transcript"]
    : ["notes"]
  const ownsRecorder = Boolean(leaseId)

  return (
    <section className="meeting-block-shell overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm">
      <header className="flex min-h-14 items-center gap-3 border-b px-4">
        <CalendarDays className="size-5 shrink-0" />
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        <input
          aria-label="Meeting title"
          className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none"
          disabled={!editable || activeRecording}
          onBlur={() => {
            if (title.trim() !== meeting.title) {
              updateMeeting.mutate({ title })
            }
          }}
          onChange={(event) => setTitle(event.target.value)}
          value={title}
        />
        <span className="text-sm text-muted-foreground">@Today</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="Meeting settings" size="icon-sm" variant="ghost">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>Meeting setup</DropdownMenuLabel>
            <DropdownMenuItem disabled>
              <FileAudio /> Upload audio or video
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings2 /> Language <span className="ml-auto text-muted-foreground">{meeting.language}</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Sparkles /> Instructions <span className="ml-auto text-muted-foreground">Auto</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <Mic /> Recorder controls require desktop
            </DropdownMenuItem>
            {nativeCapture.recovery ? (
              <DropdownMenuItem
                onClick={() => {
                  void invoke("meeting_capture_open_local_file", { meetingId })
                }}
              >
                <FolderOpen /> Open local audio
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="p-4">
        <div className="mb-4 flex items-center gap-2">
          {tabs.map((tab) => (
            <Button
              className="capitalize"
              key={tab}
              onClick={() => setActiveTab(tab)}
              size="sm"
              variant={activeTab === tab ? "secondary" : "ghost"}
            >
              {tab === "summary" ? <Sparkles /> : tab === "notes" ? <Settings2 /> : <Mic />}
              {tab}
            </Button>
          ))}
          <span
            className={cn(
              "ml-auto text-xs",
              collaboration.status === "connected"
                ? "text-emerald-600"
                : "text-muted-foreground",
            )}
          >
            {collaboration.status === "connected" ? "Live" : collaboration.status}
          </span>
        </div>

        {activeTab === "transcript" ? (
          <div className="min-h-28 rounded-lg bg-muted/35 p-4 text-sm">
            {transcript.data?.segments.length ? (
              <div className="space-y-3">
                {transcript.data.segments.map((segment) => (
                  <div className="grid grid-cols-[3.5rem_1fr] gap-3" key={segment.id}>
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatTimestamp(segment.startMs)}
                    </span>
                    <p className="whitespace-pre-wrap text-foreground">{segment.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">
                {transcript.isLoading
                  ? "Loading transcript…"
                  : "Start transcribing to create a searchable transcript."}
              </p>
            )}
            {transcript.data?.segments.length ? (
              <Button
                className="mt-4"
                onClick={() => exportTranscript(meeting.title, transcript.data.segments)}
                size="sm"
                variant="outline"
              >
                <Download /> Export transcript
              </Button>
            ) : null}
          </div>
        ) : collaboration.document ? (
          <MeetingCollaborativeEditor
            document={collaboration.document}
            editable={editable && activeTab === "notes"}
            field={activeTab}
            placeholder={
              activeTab === "summary"
                ? "The meeting summary will appear here."
                : "Write agenda items and collaborative notes…"
            }
            provider={collaboration.provider}
          />
        ) : (
          <div className="min-h-28 text-sm text-muted-foreground">
            {collaboration.error ?? "Connecting collaborative notes…"}
          </div>
        )}

        <footer className="mt-4 flex items-center justify-between border-t pt-4">
          <div className="flex items-center gap-2 text-xs capitalize text-muted-foreground">
            <span>{meeting.status === "idle" ? "Ready to record" : meeting.status}</span>
            {ownsRecorder && activeRecording ? (
              <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full origin-left rounded-full bg-emerald-500 transition-transform"
                  style={{ transform: `scaleX(${nativeCapture.level})` }}
                />
              </span>
            ) : null}
            {activeRecording && !ownsRecorder ? (
              <span>Another collaborator is recording</span>
            ) : null}
          </div>
          {editable ? (
            <div className="flex items-center gap-2">
              {meeting.status === "idle" || meeting.status === "failed" ? (
                <Button onClick={() => void runLifecycle("start")} disabled={lifecycle.isPending || recorder.claim.isPending}>
                  <Mic /> Start transcribing
                </Button>
              ) : meeting.status === "recording" ? (
                <>
                  <Button disabled={!ownsRecorder} onClick={() => void runLifecycle("pause")} variant="outline">
                    <Pause /> Pause
                  </Button>
                  <Button disabled={!ownsRecorder} onClick={() => void runLifecycle("stop")} variant="destructive">
                    <CircleStop /> Stop
                  </Button>
                </>
              ) : meeting.status === "paused" ? (
                <>
                  <Button disabled={!ownsRecorder} onClick={() => void runLifecycle("resume")} variant="outline">
                    <Play /> Resume
                  </Button>
                  <Button disabled={!ownsRecorder} onClick={() => void runLifecycle("stop")} variant="destructive">
                    <CircleStop /> Stop
                  </Button>
                </>
              ) : meeting.status === "processing" ? (
                <Button disabled><LoaderCircle className="animate-spin" /> Processing</Button>
              ) : null}
            </div>
          ) : null}
        </footer>
      </div>
    </section>
  )
}

function formatTimestamp(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

function exportTranscript(
  title: string,
  segments: Array<{ startMs: number; text: string }>,
) {
  const contents = segments
    .map((segment) => `[${formatTimestamp(segment.startMs)}] ${segment.text}`)
    .join("\n\n")
  const url = URL.createObjectURL(new Blob([contents], { type: "text/plain;charset=utf-8" }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `${title.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "meeting"}-transcript.txt`
  anchor.click()
  URL.revokeObjectURL(url)
}
