import { useEffect, useRef, useState } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { invoke, isTauri } from "@tauri-apps/api/core"
import {
  ArrowUpRightIcon,
  CircleStop,
  Download,
  FileAudio,
  FolderOpen,
  HardDrive,
  LoaderCircle,
  Maximize2,
  Mic,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Settings2,
  Smile,
  Sparkles,
  Volume2,
  X,
} from "lucide-react"
import {
  useMeeting,
  useGenerateMeetingSummary,
  useMeetingLifecycle,
  useMeetingRecorder,
  useMeetingTranscript,
  useRecordMeetingConsent,
  useUpdateMeeting,
  meetingKeys,
  type MeetingLifecycleAction,
} from "@zilobase/features/meetings"
import {
  getPageEmoji,
  usePage,
  useUpdatePage,
  type PageMetadata,
} from "@zilobase/features/pages"
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
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
  DropDrawerTrigger,
} from "@/components/ui/dropdrawer"
import {
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu"
import { IconEmojiPicker } from "@/components/ui/icon-emoji-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useOpenEmbeddedPage } from "@/hooks/use-open-embedded-page"
import { PageIconDisplay } from "@/lib/page-icon"
import { cn } from "@/lib/utils"
import type { OpenPageOptions } from "@/packages/editor/types"
import { MeetingCollaborativeEditor } from "./meeting-collaborative-editor"
import { MeetingNotesEditor } from "./meeting-notes-editor"
import { useMeetingCollaboration } from "./use-meeting-collaboration"
import { useNativeMeetingCapture } from "./use-native-meeting-capture"

export type MeetingTab = "summary" | "notes" | "transcript"

export function MeetingView({
  editable,
  fullPage = false,
  meetingId,
  notesMode = "embedded",
  onActiveTabChange,
  onOpenPage,
  showTitle,
}: {
  editable: boolean
  fullPage?: boolean
  meetingId: string
  notesMode?: "embedded" | "external"
  onActiveTabChange?: (tab: MeetingTab) => void
  onOpenPage?: (pageId: string, options?: OpenPageOptions) => void
  showTitle?: boolean
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const showMeetingTitle = showTitle ?? !fullPage
  const meetingQuery = useMeeting(meetingId)
  const generateSummary = useGenerateMeetingSummary(meetingId)
  const updateMeeting = useUpdateMeeting(meetingId)
  const lifecycle = useMeetingLifecycle(meetingId)
  const recorder = useMeetingRecorder(meetingId)
  const recordConsent = useRecordMeetingConsent(meetingId)
  const collaboration = useMeetingCollaboration(meetingId)
  const nativeCapture = useNativeMeetingCapture(meetingId)
  const [activeTab, setActiveTabState] = useState<MeetingTab>("notes")
  const setActiveTab = (tab: MeetingTab) => {
    setActiveTabState(tab)
    onActiveTabChange?.(tab)
  }
  const [consentOpen, setConsentOpen] = useState(false)
  const [captureSystemAudio, setCaptureSystemAudio] = useState(false)
  const [microphoneDeviceId, setMicrophoneDeviceId] = useState<string | undefined>()
  const [systemDeviceId, setSystemDeviceId] = useState<string | undefined>()
  const [title, setTitle] = useState("Meeting")
  const [titleActionsOpen, setTitleActionsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const [leaseId, setLeaseId] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : window.sessionStorage.getItem(`zilobase:meeting-recorder:${meetingId}`),
  )
  const meeting = meetingQuery.data?.meeting
  const notesPageId = meeting?.notesPageId ?? null
  const { data: notesPage } = usePage(notesPageId)
  const updatePage = useUpdatePage()
  const embeddedOpen = useOpenEmbeddedPage({
    contextPageId: notesPageId,
    page: notesPage,
  })
  const openPage = onOpenPage ?? embeddedOpen.openPage
  const notesEmoji = notesPage ? getPageEmoji(notesPage) : null
  const canEditEmoji = editable && Boolean(notesPageId)
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

  const saveMeetingEmoji = (nextEmoji: string) => {
    if (!notesPage) return
    updatePage.mutate(
      {
        id: notesPage.id,
        metadata: {
          ...((notesPage.metadata ?? {}) as PageMetadata),
          emoji: nextEmoji,
        },
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: meetingKeys.lists() })
        },
      },
    )
    setEmojiPickerOpen(false)
  }
  const focusTitleInput = () => {
    window.setTimeout(() => {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    }, 0)
  }
  const renderEmojiPicker = (onSelect?: () => void) => (
    <IconEmojiPicker
      onEmojiSelect={(emoji) => {
        saveMeetingEmoji(emoji)
        onSelect?.()
      }}
      onIconSelect={(svg) => {
        saveMeetingEmoji(svg)
        onSelect?.()
      }}
    />
  )

  if (meetingQuery.isLoading) {
    return (
      <div className="flex min-h-40 items-center justify-center">
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
  const emojiPicker = notesEmoji ? (
    canEditEmoji ? (
      <div className="group/icon relative shrink-0">
        <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
          <PopoverTrigger asChild>
            <button
              aria-label="Change meeting icon"
              className="flex size-9 items-center justify-center rounded-md text-2xl leading-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
              type="button"
            >
              <PageIconDisplay size="lg" value={notesEmoji} />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-auto gap-0 overflow-hidden p-0"
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            sideOffset={6}
          >
            {renderEmojiPicker()}
          </PopoverContent>
        </Popover>
        <button
          aria-label="Remove meeting icon"
          className="absolute -right-1 -top-1 hidden size-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none group-focus-within/icon:flex group-hover/icon:flex [&_svg]:size-3"
          onClick={() => saveMeetingEmoji("")}
          type="button"
        >
          <X />
        </button>
      </div>
    ) : (
      <span
        aria-label="Meeting icon"
        className="flex size-9 shrink-0 items-center justify-center rounded-md text-2xl leading-none"
      >
        <PageIconDisplay size="lg" value={notesEmoji} />
      </span>
    )
  ) : null

  return (
    <div
      className={cn(
        "meeting-block-shell",
        fullPage && "meeting-block-shell-full",
      )}
      contentEditable={false}
    >
      <div className="database-toolbar-section">
      <div className="database-toolbar">
        {showMeetingTitle ? (
        <div className="group/title flex min-w-0 items-center gap-3">
          {emojiPicker}
          <input
            aria-label="Meeting title"
            className="h-auto min-w-[1ch] max-w-[44ch] shrink-0 truncate border-0 bg-transparent px-0 py-0 text-2xl font-semibold leading-tight text-foreground shadow-none outline-none [field-sizing:content] placeholder:text-muted-foreground/40 focus-visible:ring-0 md:text-2xl"
            disabled={!editable || activeRecording}
            onBlur={() => {
              if (title.trim() !== meeting.title) {
                updateMeeting.mutate({ title })
              }
            }}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Meeting"
            ref={titleInputRef}
            value={title}
          />
          <DropDrawer open={titleActionsOpen} onOpenChange={setTitleActionsOpen}>
            <DropDrawerTrigger asChild>
              <Button
                aria-label="Open meeting title actions"
                className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-focus-within/title:opacity-100 group-hover/title:opacity-100 data-[state=open]:opacity-100"
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <MoreHorizontal />
              </Button>
            </DropDrawerTrigger>
            <DropDrawerContent align="start" className="w-64">
              <DropDrawerItem
                disabled={fullPage}
                onSelect={() => {
                  void navigate({ params: { meetingId }, to: "/m/$meetingId" })
                }}
              >
                <ArrowUpRightIcon />
                <span>View meeting</span>
              </DropDrawerItem>
              <DropDrawerItem
                disabled={!editable}
                onSelect={focusTitleInput}
              >
                <Pencil />
                <span>Edit title</span>
              </DropDrawerItem>
              <DropDrawerSub>
                <DropDrawerSubTrigger
                  className={cn(!canEditEmoji && "pointer-events-none opacity-50")}
                >
                  <Smile />
                  <span>Edit icon</span>
                </DropDrawerSubTrigger>
                <DropDrawerSubContent className="w-auto overflow-hidden p-0">
                  {renderEmojiPicker(() => setTitleActionsOpen(false))}
                </DropDrawerSubContent>
              </DropDrawerSub>
            </DropDrawerContent>
          </DropDrawer>
        </div>
        ) : null}
        <div className="flex min-w-0 items-center gap-2">
          <Tabs
            onValueChange={(value) => {
              if (value) setActiveTab(value as MeetingTab)
            }}
            value={activeTab}
          >
            <TabsList className="justify-start overflow-x-auto" variant="tab">
              {tabs.map((tab) => (
                <TabsTrigger className="grow-0 capitalize" key={tab} value={tab}>
                  {tab === "summary" ? <Sparkles /> : tab === "notes" ? <Settings2 /> : <Mic />}
                  {tab}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="min-w-0 flex-1" />
          {ownsRecorder && activeRecording ? (
            <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full origin-left rounded-full bg-emerald-500 transition-transform"
                style={{ transform: `scaleX(${nativeCapture.level})` }}
              />
            </span>
          ) : null}
          {activeRecording && !ownsRecorder ? (
            <span className="text-xs text-muted-foreground">Another collaborator is recording</span>
          ) : null}
          {summaryIsStale ? (
            <span className="text-xs text-amber-600">Summary out of date</span>
          ) : null}
          <DropDrawer open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DropDrawerTrigger asChild>
              <Button
                aria-label="Meeting settings"
                className="shrink-0 text-muted-foreground"
                size="icon"
                type="button"
                variant="ghost"
              >
                <Settings2 />
              </Button>
            </DropDrawerTrigger>
            <DropDrawerContent align="end" className="w-64">
              <DropDrawerSub>
                <DropDrawerSubTrigger>
                  <Settings2 />
                  <span>Language</span>
                </DropDrawerSubTrigger>
                <DropDrawerSubContent>
                  <DropdownMenuRadioGroup
                    onValueChange={(language) => updateMeeting.mutate({ language })}
                    value={meeting.language}
                  >
                    {[["en", "English"], ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["hi", "Hindi"]].map(([value, label]) => (
                      <DropdownMenuRadioItem key={value} value={value}>{label}</DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropDrawerSubContent>
              </DropDrawerSub>
              <DropDrawerSub>
                <DropDrawerSubTrigger>
                  <Sparkles />
                  <span>Instructions</span>
                </DropDrawerSubTrigger>
                <DropDrawerSubContent>
                  <DropdownMenuRadioGroup
                    onValueChange={(instructionsPreset) => updateMeeting.mutate({ instructionsPreset })}
                    value={meeting.instructionsPreset}
                  >
                    {[["auto", "Auto"], ["sales", "Sales"], ["standup", "Standup"], ["interview", "Interview"]].map(([value, label]) => (
                      <DropdownMenuRadioItem key={value} value={value}>{label}</DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropDrawerSubContent>
              </DropDrawerSub>
              <DropDrawerSub>
                <DropDrawerSubTrigger>
                  <Volume2 />
                  <span>Consent</span>
                </DropDrawerSubTrigger>
                <DropDrawerSubContent>
                  <DropdownMenuCheckboxItem
                    checked={meeting.autoPlayConsent}
                    onCheckedChange={(autoPlayConsent) => updateMeeting.mutate({ autoPlayConsent })}
                  >
                    Auto-play message
                  </DropdownMenuCheckboxItem>
                  <DropDrawerItem onSelect={() => void playConsentMessage(meeting.consentMessage, meeting.language)}>
                    <Volume2 />
                    <span>Play consent message</span>
                  </DropDrawerItem>
                </DropDrawerSubContent>
              </DropDrawerSub>
              <DropDrawerItem
                onSelect={() => updateMeeting.mutate({ archiveLocalAudio: !meeting.archiveLocalAudio })}
              >
                <HardDrive />
                <span>{meeting.archiveLocalAudio ? "Don't archive local audio" : "Archive local audio"}</span>
              </DropDrawerItem>
              {nativeCapture.devices.some((device) => device.kind === "microphone") ? (
                <DropDrawerSub>
                  <DropDrawerSubTrigger>
                    <Mic />
                    <span>Microphone</span>
                  </DropDrawerSubTrigger>
                  <DropDrawerSubContent>
                    <DropdownMenuRadioGroup onValueChange={setMicrophoneDeviceId} value={microphoneDeviceId}>
                      {nativeCapture.devices.filter((device) => device.kind === "microphone").map((device) => (
                        <DropdownMenuRadioItem key={device.id} value={device.id}>{device.name}</DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropDrawerSubContent>
                </DropDrawerSub>
              ) : null}
              <DropDrawerItem
                disabled={!systemDeviceId}
                onSelect={() => setCaptureSystemAudio((current) => !current)}
              >
                <FileAudio />
                <span>{captureSystemAudio ? "Stop capturing system audio" : "Capture system audio"}</span>
              </DropDrawerItem>
              {nativeCapture.recovery ? (
                <DropDrawerItem
                  onSelect={() => {
                    void invoke("meeting_capture_open_local_file", { meetingId })
                  }}
                >
                  <FolderOpen />
                  <span>Open local audio</span>
                </DropDrawerItem>
              ) : null}
            </DropDrawerContent>
          </DropDrawer>
          {editable ? (
            meeting.status === "idle" || meeting.status === "failed" ? (
              <Button
                className="database-new-button"
                disabled={lifecycle.isPending || recorder.claim.isPending}
                onClick={() => setConsentOpen(true)}
                type="button"
              >
                <Mic />
                <span>Start transcribing</span>
              </Button>
            ) : meeting.status === "recording" ? (
              <>
                <Button className="database-new-button" disabled={!ownsRecorder} onClick={() => void runLifecycle("pause")} type="button" variant="outline">
                  <Pause />
                  <span>Pause</span>
                </Button>
                <Button className="database-new-button" disabled={!ownsRecorder} onClick={() => void runLifecycle("stop")} type="button" variant="destructive">
                  <CircleStop />
                  <span>Stop</span>
                </Button>
              </>
            ) : meeting.status === "paused" ? (
              <>
                <Button className="database-new-button" disabled={!ownsRecorder} onClick={() => void runLifecycle("resume")} type="button" variant="outline">
                  <Play />
                  <span>Resume</span>
                </Button>
                <Button className="database-new-button" disabled={!ownsRecorder} onClick={() => void runLifecycle("stop")} type="button" variant="destructive">
                  <CircleStop />
                  <span>Stop</span>
                </Button>
              </>
            ) : meeting.status === "processing" ? (
              <Button
                className="database-new-button"
                disabled={generateSummary.isPending || !transcript.data?.segments.length}
                onClick={() => void generateAndCleanUp()}
                type="button"
              >
                {generateSummary.isPending ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
                <span>Generate summary</span>
              </Button>
            ) : meeting.status === "completed" && summaryIsStale ? (
              <Button
                className="database-new-button"
                disabled={generateSummary.isPending}
                onClick={() => void generateAndCleanUp()}
                type="button"
                variant="outline"
              >
                <Sparkles />
                <span>Regenerate summary</span>
              </Button>
            ) : null
          ) : null}
          {!fullPage ? (
            <Button
              aria-label="Expand meeting"
              asChild
              className="database-expand-button"
              size="icon"
              type="button"
              variant="ghost"
            >
              <Link params={{ meetingId }} title="Expand meeting" to="/m/$meetingId">
                <Maximize2 />
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
      </div>

      {notesMode === "external" && activeTab === "notes" ? null : (
      <div className="database-scroll-section meeting-block-body">
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
        ) : activeTab === "notes" ? (
          notesPageId ? (
            <MeetingNotesEditor
              editable={editable}
              onOpenPage={openPage}
              pageId={notesPageId}
            />
          ) : (
            <div className="min-h-28 text-sm text-muted-foreground">
              Meeting notes are still being created…
            </div>
          )
        ) : collaboration.document ? (
          <MeetingCollaborativeEditor
            document={collaboration.document}
            editable={false}
            field="summary"
            placeholder="The meeting summary will appear here."
            provider={collaboration.provider}
          />
        ) : (
          <div className="min-h-28 text-sm text-muted-foreground">
            {collaboration.error ?? "Connecting meeting summary…"}
          </div>
        )}
      </div>
      )}
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
    </div>
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
