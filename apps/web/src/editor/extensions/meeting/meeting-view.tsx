import { useEffect, useState } from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import {
  CalendarDays,
  ChevronDown,
  CircleStop,
  Download,
  FileAudio,
  FolderOpen,
  HardDrive,
  LoaderCircle,
  Mic,
  MoreHorizontal,
  Pause,
  Play,
  Settings2,
  Sparkles,
  Volume2,
} from "lucide-react"
import {
  useMeeting,
  useGenerateMeetingSummary,
  useMeetingLifecycle,
  useMeetingRecorder,
  useMeetingTranscript,
  useRecordMeetingConsent,
  useUpdateMeeting,
  type MeetingLifecycleAction,
} from "@zilobase/features/meetings"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
  const generateSummary = useGenerateMeetingSummary(meetingId)
  const updateMeeting = useUpdateMeeting(meetingId)
  const lifecycle = useMeetingLifecycle(meetingId)
  const recorder = useMeetingRecorder(meetingId)
  const recordConsent = useRecordMeetingConsent(meetingId)
  const collaboration = useMeetingCollaboration(meetingId)
  const nativeCapture = useNativeMeetingCapture(meetingId)
  const [activeTab, setActiveTab] = useState<MeetingTab>("notes")
  const [consentOpen, setConsentOpen] = useState(false)
  const [captureSystemAudio, setCaptureSystemAudio] = useState(false)
  const [microphoneDeviceId, setMicrophoneDeviceId] = useState<string | undefined>()
  const [systemDeviceId, setSystemDeviceId] = useState<string | undefined>()
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
    const microphone = nativeCapture.devices.find(
      (device) => device.kind === "microphone" && device.isDefault,
    ) ?? nativeCapture.devices.find((device) => device.kind === "microphone")
    const system = nativeCapture.devices.find(
      (device) => device.isSystemCaptureCandidate,
    )
    setMicrophoneDeviceId((current) => current ?? microphone?.id)
    setSystemDeviceId((current) => current ?? system?.id)
  }, [nativeCapture.devices])

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
              captureSystemAudio,
              meetingId,
              microphoneDeviceId,
              systemDeviceId: captureSystemAudio ? systemDeviceId : undefined,
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
      if (action === "pause") {
        await invoke("meeting_capture_pause")
        try {
          await lifecycle.mutateAsync({ action })
        } catch (error) {
          await invoke("meeting_capture_resume").catch(() => undefined)
          throw error
        }
        return
      }
      if (action === "resume") {
        await invoke("meeting_capture_resume")
        try {
          await lifecycle.mutateAsync({ action })
        } catch (error) {
          await invoke("meeting_capture_pause").catch(() => undefined)
          throw error
        }
        return
      }
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

  const confirmConsentAndStart = async () => {
    try {
      if (!meeting) throw new Error("Meeting is unavailable.")
      let mode: "confirmed" | "played" = "confirmed"
      if (meeting.autoPlayConsent) {
        await playConsentMessage(meeting.consentMessage, meeting.language)
        mode = "played"
      }
      await recordConsent.mutateAsync(mode)
      await runLifecycle("start")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start recording.")
    }
  }

  const generateAndCleanUp = async () => {
    try {
      if (!meeting) throw new Error("Meeting is unavailable.")
      await generateSummary.mutateAsync()
      if (isTauri() && !meeting.archiveLocalAudio) {
        await invoke("meeting_capture_delete_local_file", { meetingId })
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Summary failed.")
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
  const summaryIsStale = Boolean(
    meeting.summaryGeneratedAt
      && (transcript.data?.segments.length ?? 0) > meeting.summarySourceSegmentCount,
  )

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
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Settings2 /> Language <span className="ml-auto text-muted-foreground">{meeting.language}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  onValueChange={(language) => updateMeeting.mutate({ language })}
                  value={meeting.language}
                >
                  {[['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['hi', 'Hindi']].map(([value, label]) => (
                    <DropdownMenuRadioItem key={value} value={value}>{label}</DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Sparkles /> Instructions <span className="ml-auto text-muted-foreground">{meeting.instructionsPreset}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  onValueChange={(instructionsPreset) => updateMeeting.mutate({ instructionsPreset })}
                  value={meeting.instructionsPreset}
                >
                  {[['auto', 'Auto'], ['sales', 'Sales'], ['standup', 'Standup'], ['interview', 'Interview']].map(([value, label]) => (
                    <DropdownMenuRadioItem key={value} value={value}>{label}</DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Volume2 /> Consent
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuCheckboxItem
                  checked={meeting.autoPlayConsent}
                  onCheckedChange={(autoPlayConsent) => updateMeeting.mutate({ autoPlayConsent })}
                >
                  Auto-play message
                </DropdownMenuCheckboxItem>
                <DropdownMenuItem onClick={() => void playConsentMessage(meeting.consentMessage, meeting.language)}>
                  <Volume2 /> Play consent message
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuCheckboxItem
              checked={meeting.archiveLocalAudio}
              onCheckedChange={(archiveLocalAudio) => updateMeeting.mutate({ archiveLocalAudio })}
            >
              <HardDrive /> Archive local audio
            </DropdownMenuCheckboxItem>
            {nativeCapture.devices.some((device) => device.kind === "microphone") ? (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger><Mic /> Microphone</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup onValueChange={setMicrophoneDeviceId} value={microphoneDeviceId}>
                    {nativeCapture.devices.filter((device) => device.kind === "microphone").map((device) => (
                      <DropdownMenuRadioItem key={device.id} value={device.id}>{device.name}</DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : null}
            <DropdownMenuCheckboxItem
              checked={captureSystemAudio}
              disabled={!systemDeviceId}
              onCheckedChange={setCaptureSystemAudio}
            >
              <FileAudio /> Capture system audio
            </DropdownMenuCheckboxItem>
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
          {summaryIsStale ? (
            <span className="text-xs text-amber-600">Summary out of date</span>
          ) : null}
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
                <Button onClick={() => setConsentOpen(true)} disabled={lifecycle.isPending || recorder.claim.isPending}>
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
                <Button
                  disabled={generateSummary.isPending || !transcript.data?.segments.length}
                  onClick={() => void generateAndCleanUp()}
                >
                  {generateSummary.isPending ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
                  Generate summary
                </Button>
              ) : meeting.status === "completed" && summaryIsStale ? (
                <Button
                  disabled={generateSummary.isPending}
                  onClick={() => void generateAndCleanUp()}
                  variant="outline"
                >
                  <Sparkles /> Regenerate summary
                </Button>
              ) : null}
            </div>
          ) : null}
        </footer>
      </div>
      <AlertDialog onOpenChange={setConsentOpen} open={consentOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Notify everyone before recording</AlertDialogTitle>
            <AlertDialogDescription>
              {meeting.consentMessage} Confirm that everyone in the meeting has been notified and that recording is permitted where they are located.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConsentOpen(false)
                void confirmConsentAndStart()
              }}
            >
              {meeting.autoPlayConsent ? "Play message and start" : "Everyone is notified — start"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function playConsentMessage(message: string, language: string) {
  return new Promise<void>((resolve, reject) => {
    if (!("speechSynthesis" in window)) {
      reject(new Error("Spoken consent is unavailable on this device."))
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(message)
    utterance.lang = language
    utterance.onend = () => resolve()
    utterance.onerror = () => reject(new Error("Could not play the consent message."))
    window.speechSynthesis.speak(utterance)
  })
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
