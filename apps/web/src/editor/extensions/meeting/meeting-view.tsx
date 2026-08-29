import { useEffect, useRef, useState } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
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
} from "@/shared/components/icons"
import {
  useMeeting,
  useGenerateMeetingSummary,
  useMeetingLifecycle,
  useMeetingRecorder,
  useRecordMeetingConsent,
  useUpdateMeeting,
  meetingKeys,
  type MeetingLifecycleAction,
} from "@zilobase/features/meetings"
import { useSession } from "@zilobase/features/auth"
import {
  getPageEmoji,
  isMeetingLocked,
  usePage,
  useUpdatePage,
  type PageMetadata,
} from "@zilobase/features/pages"
import { toast } from "sonner"

import { Button } from "@/shared/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog"
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
  DropDrawerTrigger,
} from "@/shared/ui/dropdrawer"
import {
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/shared/ui/dropdown-menu"
import { IconEmojiPicker } from "@/shared/ui/icon-emoji-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs"
import { useOpenEmbeddedPage } from "@/features/pages/hooks/index"
import { DefaultPageIcon, PageIconDisplay } from "@/features/pages/index"
import { cn } from "@/shared/lib/utils"
import type { OpenPageOptions } from "@/packages/editor/types"
import { MeetingCollaborativeEditor } from "./meeting-collaborative-editor"
import {
  combineMeetingTranscriptDrafts,
  resolveMeetingTranscriptPreview,
  type MeetingTranscriptPresentationDraft,
} from "@/packages/editor/extensions/meeting-transcript-preview"
import { meetingTranscriptPlainText } from "./meeting-transcript-text"
import { useMeetingCollaboration } from "./use-meeting-collaboration"
import { useMeetingCapture } from "@/features/desktop/meetings/index"

type MeetingTab = "summary" | "notes" | "transcript"

export function MeetingView({
  editable: requestedEditable,
  embeddedPage,
  fullPage = false,
  meetingId,
  onOpenPage,
  showTitle,
}: {
  editable: boolean
  embeddedPage?: { emoji: string | null; id: string; name: string }
  fullPage?: boolean
  meetingId: string
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
  const { data: session } = useSession()
  const collaboration = useMeetingCollaboration(meetingId, session?.user)
  const meetingCapture = useMeetingCapture(meetingId)
  const [activeTab, setActiveTabState] = useState<MeetingTab>("notes")
  const setActiveTab = (tab: MeetingTab) => {
    setActiveTabState(tab)
  }
  const [consentOpen, setConsentOpen] = useState(false)
  const [captureSystemAudio, setCaptureSystemAudio] = useState(true)
  const [microphoneDeviceId, setMicrophoneDeviceId] = useState<string | undefined>()
  const [systemDeviceId, setSystemDeviceId] = useState<string | undefined>()
  const shouldCaptureSystemAudio = captureSystemAudio && Boolean(systemDeviceId)
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
  const editable = requestedEditable && !isMeetingLocked(notesPage)
  const updatePage = useUpdatePage()
  const embeddedOpen = useOpenEmbeddedPage({
    contextPageId: notesPageId,
    page: notesPage,
  })
  const openPage = onOpenPage ?? embeddedOpen.openPage
  const notesEmoji = notesPage ? getPageEmoji(notesPage) : null
  const canEditEmoji = editable && Boolean(notesPageId)
  const recordingPresence = collaboration.document?.getMap<string | number>(
    "recordingPresence",
  )
  const presenceStatus = recordingPresence?.get("status")
  const realtimeStatus = presenceStatus === "recording"
      || presenceStatus === "paused"
      || presenceStatus === "finishing"
    ? presenceStatus
    : null
  const effectiveMeetingStatus = realtimeStatus === "finishing"
    ? "processing"
    : realtimeStatus ?? meeting?.status
  const activeRecording = effectiveMeetingStatus === "recording"
    || effectiveMeetingStatus === "paused"
  const transcriptGenerationActive = activeRecording
    || realtimeStatus === "finishing"

  useEffect(() => {
    if (meeting?.title) setTitle(meeting.title)
  }, [meeting?.title])

  useEffect(() => {
    const microphone = meetingCapture.devices.find(
      (device) => device.kind === "microphone" && device.isDefault,
    ) ?? meetingCapture.devices.find((device) => device.kind === "microphone")
    const system = meetingCapture.devices.find(
      (device) => device.isSystemCaptureCandidate &&
        device.captureMode === "native-loopback" && device.isDefault,
    ) ?? meetingCapture.devices.find((device) => device.isSystemCaptureCandidate)
    setMicrophoneDeviceId((current) => current ?? microphone?.id)
    setSystemDeviceId((current) => current ?? system?.id)
  }, [meetingCapture.devices])

  const runLifecycle = async (action: MeetingLifecycleAction) => {
    try {
      if (action === "start") {
        const claim = await recorder.claim.mutateAsync()
        setLeaseId(claim.leaseId)
        window.sessionStorage.setItem(
          `zilobase:meeting-recorder:${meetingId}`,
          claim.leaseId,
        )
        try {
          await meetingCapture.start({
            audioTicket: claim.token,
            audioWebsocketUrl: claim.websocketUrl,
            captureMicrophone: true,
            captureSystemAudio: shouldCaptureSystemAudio,
            meetingId,
            microphoneDeviceId,
            systemDeviceId: shouldCaptureSystemAudio ? systemDeviceId : undefined,
          })
          await lifecycle.mutateAsync({ action, leaseId: claim.leaseId })
        } catch (error) {
          await meetingCapture.stop().catch(() => undefined)
          await recorder.release.mutateAsync(claim.leaseId).catch(() => undefined)
          setLeaseId(null)
          window.sessionStorage.removeItem(`zilobase:meeting-recorder:${meetingId}`)
          throw error
        }
        return
      }

      if (action === "pause") {
        await meetingCapture.pause()
        try {
          await lifecycle.mutateAsync({ action, leaseId: leaseId ?? undefined })
        } catch (error) {
          await meetingCapture.resume().catch(() => undefined)
          throw error
        }
        return
      }
      if (action === "resume") {
        await meetingCapture.resume()
        try {
          await lifecycle.mutateAsync({ action, leaseId: leaseId ?? undefined })
        } catch (error) {
          await meetingCapture.pause().catch(() => undefined)
          throw error
        }
        return
      }
      if (action === "stop") {
        const capture = await meetingCapture.stop()
        await lifecycle.mutateAsync({
          action,
          durationMs: capture.elapsedMs,
          leaseId: leaseId ?? undefined,
        })
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
    if (!meeting) {
      toast.error("Meeting is unavailable.")
      return
    }
    const preparation = meetingCapture.prepare({
      captureMicrophone: true,
      captureSystemAudio: shouldCaptureSystemAudio,
      meetingId,
      microphoneDeviceId,
      systemDeviceId: shouldCaptureSystemAudio ? systemDeviceId : undefined,
    })
    try {
      await preparation
      let mode: "confirmed" | "played" = "confirmed"
      if (meeting.autoPlayConsent) {
        await playConsentMessage(meeting.consentMessage, meeting.language)
        mode = "played"
      }
      await recordConsent.mutateAsync(mode)
      await runLifecycle("start")
    } catch (error) {
      await meetingCapture.cancelPreparation().catch(() => undefined)
      toast.error(error instanceof Error ? error.message : "Could not start recording.")
    }
  }

  const generateAndCleanUp = async () => {
    try {
      if (!meeting) throw new Error("Meeting is unavailable.")
      await generateSummary.mutateAsync()
      setActiveTab("summary")
      if (!meeting.archiveLocalAudio) {
        await meetingCapture.deleteLocalFile()
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
      <div className="rounded-xl border border-destructive bg-status-danger-diff-surface p-4 text-sm text-destructive">
        {meetingQuery.error instanceof Error
          ? meetingQuery.error.message
          : "This meeting is unavailable."}
      </div>
    )
  }

  const tabs: MeetingTab[] = ["summary", "notes", "transcript"]
  const transcriptSegmentCount = collaboration.document
    ?.getMap("transcriptSegmentIds").size ?? 0
  const collaborativeLiveTranscripts = [
    readCollaborativeTranscriptDraft(
      collaboration.document?.getMap<string | number>("liveTranscript:microphone"),
      "microphone",
    ),
    readCollaborativeTranscriptDraft(
      collaboration.document?.getMap<string | number>("liveTranscript:system"),
      "system",
    ),
  ].filter((draft): draft is TranscriptDraft => draft !== null)
  const localLiveTranscripts = (meetingCapture.liveTranscripts ?? []).filter(
    (draft) => draft.meetingId === meetingId,
  )
  const combinedLivePreview = combineMeetingTranscriptDrafts(
    collaborativeLiveTranscripts,
    localLiveTranscripts,
  )
  const transcriptPreview = resolveMeetingTranscriptPreview({
    activity: realtimeStatus === "finishing"
      ? "finishing"
      : activeRecording
        ? "listening"
        : null,
    effectiveMeetingStatus,
    livePreview: combinedLivePreview,
    transcriptSegmentCount,
    visible: activeTab === "transcript",
  })
  const recorderName = typeof recordingPresence?.get("recorderName") === "string"
    ? recordingPresence.get("recorderName") as string
    : "Another collaborator"
  const transcriptEditable = editable
    && (activeTab !== "transcript" || !transcriptGenerationActive)
  const ownsRecorder = Boolean(leaseId)
  const summaryIsStale = Boolean(
    meeting.summaryGeneratedAt
      && transcriptSegmentCount > meeting.summarySourceSegmentCount,
  )
  const emojiPicker = notesEmoji ? (
    canEditEmoji ? (
      <div className="group/icon relative shrink-0">
        <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
          <PopoverTrigger asChild>
            <button
              aria-label="Change meeting icon"
              className="flex size-9 items-center justify-center rounded-md text-2xl leading-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
          className="absolute -right-1 -top-1 hidden size-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground active:bg-active active:text-active-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none group-focus-within/icon:flex group-hover/icon:flex [&_svg]:size-3"
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
      <div className="database-toolbar-section meeting-block-header">
      <div className="database-toolbar">
        {showMeetingTitle ? (
        <div className="group/title flex min-w-0 items-center gap-3">
          {emojiPicker}
          <input
            aria-label="Meeting title"
            className={cn(
              "h-auto min-w-[1ch] max-w-[44ch] shrink-0 truncate border-0 bg-transparent px-0 py-0 font-semibold leading-tight tracking-normal text-foreground shadow-none outline-none [field-sizing:content] placeholder:text-muted-foreground focus-visible:ring-0",
              fullPage ? "text-2xl md:text-2xl" : "text-3xl",
            )}
            disabled={!editable || activeRecording}
            data-structural-block-title
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
            className="min-w-0"
            onValueChange={(value) => {
              if (value) setActiveTab(value as MeetingTab)
            }}
            value={activeTab}
          >
            <TabsList className="min-w-0 w-full justify-start overflow-x-auto" variant="tab">
              {tabs.map((tab) => (
                <TabsTrigger
                  className="h-8 shrink-0 grow-0 gap-2 px-3 capitalize"
                  key={tab}
                  value={tab}
                >
                  {tab === "summary" ? (
                    <Sparkles className="size-4 shrink-0" />
                  ) : tab === "notes" ? (
                    <Settings2 className="size-4 shrink-0" />
                  ) : (
                    <Mic className="size-4 shrink-0" />
                  )}
                  {tab}
                </TabsTrigger>
              ))}
              {embeddedPage ? (
                <Link
                  aria-label={`Open ${embeddedPage.name}`}
                  className="relative inline-flex h-8 max-w-52 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent px-3 py-0.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring active:bg-active active:text-active-foreground"
                  params={{ pageId: embeddedPage.id }}
                  search={{ meeting: meetingId }}
                  title={`Open ${embeddedPage.name}`}
                  to="/p/$pageId"
                >
                  {embeddedPage.emoji ? (
                    <PageIconDisplay size="sm" value={embeddedPage.emoji} />
                  ) : (
                    <DefaultPageIcon className="size-3.5" />
                  )}
                  <span className="truncate">{embeddedPage.name}</span>
                  <ArrowUpRightIcon className="size-3.5 shrink-0" />
                </Link>
              ) : null}
            </TabsList>
          </Tabs>
          <div className="min-w-0 flex-1" />
          {ownsRecorder && activeRecording ? (
            <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full origin-left rounded-full bg-status-success transition-transform"
                style={{ transform: `scaleX(${meetingCapture.level})` }}
              />
            </span>
          ) : null}
          {activeRecording && !ownsRecorder ? (
            <span className="text-xs text-muted-foreground">
              {recorderName} is {effectiveMeetingStatus === "paused" ? "paused" : "recording"}
            </span>
          ) : null}
          {ownsRecorder && meetingCapture.status?.warnings?.length ? (
            <span className="max-w-56 truncate text-xs text-status-warning-foreground" title={meetingCapture.status.warnings.at(-1)}>
              {meetingCapture.status.warnings.at(-1)}
            </span>
          ) : null}
          {summaryIsStale ? (
            <span className="text-xs text-status-warning-foreground">Summary out of date</span>
          ) : null}
          {editable ? (
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
              {meetingCapture.devices.some((device) => device.kind === "microphone") ? (
                <DropDrawerSub>
                  <DropDrawerSubTrigger>
                    <Mic />
                    <span>Microphone</span>
                  </DropDrawerSubTrigger>
                  <DropDrawerSubContent>
                    <DropdownMenuRadioGroup onValueChange={setMicrophoneDeviceId} value={microphoneDeviceId}>
                      {meetingCapture.devices.filter((device) => device.kind === "microphone").map((device) => (
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
                <span>{!systemDeviceId
                  ? "System audio unavailable"
                  : captureSystemAudio
                    ? "Stop capturing system audio"
                    : "Capture system audio"}</span>
              </DropDrawerItem>
              {meetingCapture.recovery ? (
                <DropDrawerItem
                  onSelect={() => {
                    void meetingCapture.openLocalFile()
                  }}
                >
                  <FolderOpen />
                  <span>Open local audio</span>
                </DropDrawerItem>
              ) : null}
            </DropDrawerContent>
          </DropDrawer>
          ) : null}
          {editable ? (
            effectiveMeetingStatus === "idle" || effectiveMeetingStatus === "failed" ? (
              <Button
                className="database-new-button"
                disabled={lifecycle.isPending || recorder.claim.isPending}
                onClick={() => setConsentOpen(true)}
                type="button"
              >
                <Mic />
                <span>Start transcribing</span>
              </Button>
            ) : effectiveMeetingStatus === "recording" && ownsRecorder ? (
              <>
                <Button className="database-new-button" onClick={() => void runLifecycle("pause")} type="button" variant="outline">
                  <Pause />
                  <span>Pause</span>
                </Button>
                <Button className="database-new-button" onClick={() => void runLifecycle("stop")} type="button" variant="destructive">
                  <CircleStop />
                  <span>Stop</span>
                </Button>
              </>
            ) : effectiveMeetingStatus === "paused" && ownsRecorder ? (
              <>
                <Button className="database-new-button" onClick={() => void runLifecycle("resume")} type="button" variant="outline">
                  <Play />
                  <span>Resume</span>
                </Button>
                <Button className="database-new-button" onClick={() => void runLifecycle("stop")} type="button" variant="destructive">
                  <CircleStop />
                  <span>Stop</span>
                </Button>
              </>
            ) : effectiveMeetingStatus === "processing" ? (
              <Button
                className="database-new-button"
                disabled={generateSummary.isPending || transcriptSegmentCount === 0}
                onClick={() => void generateAndCleanUp()}
                type="button"
              >
                {generateSummary.isPending ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
                <span>Generate summary</span>
              </Button>
            ) : effectiveMeetingStatus === "completed" && summaryIsStale ? (
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

      <div className="database-scroll-section meeting-block-body">
        {collaboration.document && collaboration.provider && collaboration.user ? (
          <>
            <MeetingCollaborativeEditor
              document={collaboration.document}
              editable={transcriptEditable}
              field={activeTab}
              livePreview={transcriptPreview}
              onOpenPage={openPage}
              pageId={meeting.pageId}
              provider={collaboration.provider}
              status={collaboration.status}
              user={collaboration.user}
              workspaceId={meeting.workspaceId}
            />
            {activeTab === "transcript" && transcriptSegmentCount > 0 ? (
              <Button
                className="mt-4"
                onClick={() => exportTranscript(meeting.title, collaboration.document!)}
                size="sm"
                variant="outline"
              >
                <Download /> Export transcript
              </Button>
            ) : null}
          </>
        ) : (
          <div className="min-h-28 text-sm text-muted-foreground">
            {collaboration.error ?? "Connecting meeting content…"}
          </div>
        )}
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
    </div>
  )
}

type TranscriptDraft = MeetingTranscriptPresentationDraft

function readCollaborativeTranscriptDraft(
  value: import("yjs").Map<string | number> | undefined,
  source: TranscriptDraft["source"],
): TranscriptDraft | null {
  const itemId = value?.get("itemId")
  const startMs = value?.get("startMs")
  const text = value?.get("text")
  const updatedAt = value?.get("updatedAt")
  return typeof itemId === "string"
      && typeof startMs === "number"
      && typeof text === "string"
      && typeof updatedAt === "number"
    ? { itemId, source, startMs, text, updatedAt }
    : null
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

function exportTranscript(title: string, meetingDocument: import("yjs").Doc) {
  const contents = meetingTranscriptPlainText(meetingDocument)
  const url = URL.createObjectURL(new Blob([contents], { type: "text/plain;charset=utf-8" }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `${title.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "meeting"}-transcript.txt`
  anchor.click()
  URL.revokeObjectURL(url)
}
