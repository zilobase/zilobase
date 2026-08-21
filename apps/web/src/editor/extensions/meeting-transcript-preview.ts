import { Extension, type Editor } from "@tiptap/core"
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { isNearScrollEnd } from "./meeting-transcript-scroll"

export { isNearScrollEnd } from "./meeting-transcript-scroll"

export type MeetingTranscriptPreviewState =
  | {
      itemId: string
      kind: "live"
      speaker: "Others" | "You"
      startMs: number
      text: string
    }
  | {
      itemId: null
      kind: "status"
      text: string
    }

export type MeetingTranscriptPresentationDraft = {
  itemId: string
  source: "microphone" | "system"
  startMs: number
  text: string
  updatedAt: number
}

export function combineMeetingTranscriptDrafts(
  ...draftGroups: MeetingTranscriptPresentationDraft[][]
): MeetingTranscriptPreviewState[] {
  const newestBySource = new Map<
    MeetingTranscriptPresentationDraft["source"],
    MeetingTranscriptPresentationDraft
  >()

  for (const draft of draftGroups.flat()) {
    const previous = newestBySource.get(draft.source)
    if (!previous || draft.updatedAt >= previous.updatedAt) {
      newestBySource.set(draft.source, draft)
    }
  }

  return [...newestBySource.values()]
    .sort((left, right) =>
      left.startMs - right.startMs || left.source.localeCompare(right.source)
    )
    .map((draft) => ({
      itemId: draft.itemId,
      kind: "live" as const,
      speaker: draft.source === "microphone" ? "You" as const : "Others" as const,
      startMs: draft.startMs,
      text: draft.text,
    }))
}

export function resolveMeetingTranscriptPreview({
  activity,
  effectiveMeetingStatus,
  livePreview,
  transcriptSegmentCount,
  visible,
}: {
  activity: "finishing" | "listening" | null
  effectiveMeetingStatus: string | undefined
  livePreview: MeetingTranscriptPreviewState[]
  transcriptSegmentCount: number
  visible: boolean
}): MeetingTranscriptPreviewState[] | null {
  if (!visible) return null
  if (livePreview.length) return livePreview
  if (activity === "listening") {
    return [{
      itemId: null,
      kind: "status",
      text: "Listening… Live words will appear here while you speak.",
    }]
  }
  if (activity === "finishing") {
    return [{ itemId: null, kind: "status", text: "Finishing the transcript…" }]
  }
  if (transcriptSegmentCount > 0) return null
  return [{
    itemId: null,
    kind: "status",
    text: effectiveMeetingStatus === "idle"
      ? "Start transcribing to create a searchable transcript."
      : "No transcript was generated.",
  }]
}

type MeetingTranscriptPreviewMeta =
  | { previews: MeetingTranscriptPreviewState[]; type: "set" }
  | { type: "clear" }

export const meetingTranscriptPreviewPluginKey =
  new PluginKey<MeetingTranscriptPreviewState[] | null>("meetingTranscriptPreview")

export function setMeetingTranscriptPreviewMeta(
  tr: Transaction,
  previews: MeetingTranscriptPreviewState[] | null,
) {
  return tr.setMeta(
    meetingTranscriptPreviewPluginKey,
    previews?.length ? { previews, type: "set" } : { type: "clear" },
  )
}

export function setMeetingTranscriptPreview(
  editor: Editor,
  previews: MeetingTranscriptPreviewState[] | null,
) {
  if (editor.isDestroyed) return
  const shouldFollow = isNearScrollEnd(editor.view.dom)
  editor.view.dispatch(setMeetingTranscriptPreviewMeta(editor.state.tr, previews))

  if (!previews?.length || !shouldFollow) return
  requestAnimationFrame(() => {
    if (editor.isDestroyed) return
    const elements = editor.view.dom.querySelectorAll<HTMLElement>(
      "[data-meeting-transcript-preview]",
    )
    elements.item(elements.length - 1)?.scrollIntoView({ block: "nearest" })
  })
}

export const MeetingTranscriptPreview = Extension.create({
  name: "meetingTranscriptPreview",

  addProseMirrorPlugins() {
    return [
      new Plugin<MeetingTranscriptPreviewState[] | null>({
        key: meetingTranscriptPreviewPluginKey,
        state: {
          init: () => null,
          apply(tr, previous) {
            const meta = tr.getMeta(meetingTranscriptPreviewPluginKey) as
              | MeetingTranscriptPreviewMeta
              | undefined

            if (meta?.type === "clear") return null
            if (meta?.type === "set") return meta.previews
            return previous
          },
        },
        props: {
          decorations(state) {
            const previews = meetingTranscriptPreviewPluginKey.getState(state)
            if (!previews?.length) return DecorationSet.empty

            return DecorationSet.create(state.doc, previews.map((preview, index) =>
              Decoration.widget(
                state.doc.content.size,
                () => createMeetingTranscriptPreviewElement(preview),
                {
                  key: [
                    preview.kind,
                    preview.itemId,
                    preview.kind === "live" ? preview.startMs : null,
                    preview.text,
                  ].join(":"),
                  side: index + 1,
                },
              )
            ))
          },
        },
      }),
    ]
  },
})

export function createMeetingTranscriptPreviewElement(
  preview: MeetingTranscriptPreviewState,
) {
  // A live preview deliberately uses the same element and text structure as
  // the persisted transcript paragraph. The editor's normal paragraph rules
  // therefore own its typography and spacing, so the final Yjs replacement
  // does not visually jump when a transcription turn completes.
  const paragraph = document.createElement(preview.kind === "live" ? "p" : "div")
  paragraph.className = "meeting-transcript-preview"
  paragraph.setAttribute("contenteditable", "false")
  paragraph.dataset.kind = preview.kind
  paragraph.dataset.meetingTranscriptPreview = "true"
  paragraph.setAttribute("aria-label", preview.kind === "live"
    ? "Live transcript"
    : "Transcript status")
  paragraph.setAttribute("aria-live", "polite")

  if (preview.kind === "live") {
    paragraph.textContent = formatMeetingTranscriptPreviewText(
      preview.startMs,
      preview.text,
      preview.speaker,
    )
    return paragraph
  }

  const indicator = document.createElement("span")
  indicator.className = "meeting-transcript-preview-indicator"
  indicator.setAttribute("aria-hidden", "true")
  paragraph.append(indicator)

  const text = document.createElement("span")
  text.className = "meeting-transcript-preview-text"
  text.textContent = preview.text
  paragraph.append(text)
  return paragraph
}

export function formatMeetingTranscriptPreviewText(
  startMs: number,
  text: string,
  speaker?: "Others" | "You",
) {
  const totalSeconds = Math.max(0, Math.floor(startMs / 1_000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `[${minutes}:${seconds.toString().padStart(2, "0")}] ${speaker ? `${speaker}: ` : ""}${text}`
}
