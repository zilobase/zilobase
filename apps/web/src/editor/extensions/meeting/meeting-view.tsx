import { useEffect, useState } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import {
  CalendarDays,
  ChevronDown,
  CircleStop,
  FileAudio,
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
  const [activeTab, setActiveTab] = useState<MeetingTab>("notes")
  const [title, setTitle] = useState("Meeting")
  const [leaseId, setLeaseId] = useState<string | null>(null)
  const meeting = meetingQuery.data?.meeting
  const activeRecording = meeting?.status === "recording" || meeting?.status === "paused"

  useEffect(() => {
    if (meeting?.title) setTitle(meeting.title)
  }, [meeting?.title])

  useEffect(() => {
    if (!leaseId || !activeRecording) return
    const interval = window.setInterval(() => {
      recorder.heartbeat.mutate(leaseId)
    }, 10_000)
    return () => window.clearInterval(interval)
  }, [activeRecording, leaseId, recorder.heartbeat])

  const runLifecycle = async (action: MeetingLifecycleAction) => {
    try {
      if (action === "start") {
        if (!isTauri()) throw new Error("Meeting recording is available in the desktop app.")
        const claim = await recorder.claim.mutateAsync()
        setLeaseId(claim.leaseId)
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
    ? ["summary", "notes", "transcript"]
    : ["notes"]

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
          <div className="min-h-28 rounded-lg bg-muted/35 p-4 text-sm text-muted-foreground">
            {meeting.transcriptRevision > 0
              ? "Transcript segments will appear here."
              : "Start transcribing to create a searchable transcript."}
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
          <span className="text-xs capitalize text-muted-foreground">
            {meeting.status === "idle" ? "Ready to record" : meeting.status}
          </span>
          {editable ? (
            <div className="flex items-center gap-2">
              {meeting.status === "idle" || meeting.status === "failed" ? (
                <Button onClick={() => void runLifecycle("start")} disabled={lifecycle.isPending || recorder.claim.isPending}>
                  <Mic /> Start transcribing
                </Button>
              ) : meeting.status === "recording" ? (
                <>
                  <Button onClick={() => void runLifecycle("pause")} variant="outline">
                    <Pause /> Pause
                  </Button>
                  <Button onClick={() => void runLifecycle("stop")} variant="destructive">
                    <CircleStop /> Stop
                  </Button>
                </>
              ) : meeting.status === "paused" ? (
                <>
                  <Button onClick={() => void runLifecycle("resume")} variant="outline">
                    <Play /> Resume
                  </Button>
                  <Button onClick={() => void runLifecycle("stop")} variant="destructive">
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
