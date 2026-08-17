import { Node, mergeAttributes } from "@tiptap/core"
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react"

import { MeetingView } from "./meeting-view"

export type MeetingBlockOptions = {
  editable?: boolean
}

function MeetingBlockView({ extension, node }: ReactNodeViewProps) {
  const meetingId = node.attrs.meetingId as string | null
  const options = extension.options as MeetingBlockOptions

  return (
    <NodeViewWrapper
      className="meeting-block"
      data-meeting-id={meetingId ?? undefined}
      data-type="meetingBlock"
    >
      {meetingId ? (
        <MeetingView editable={options.editable !== false} meetingId={meetingId} />
      ) : (
        <div className="rounded-xl border p-4 text-sm text-muted-foreground">
          Meeting setup is incomplete.
        </div>
      )}
    </NodeViewWrapper>
  )
}

export const MeetingBlock = Node.create<MeetingBlockOptions>({
  name: "meetingBlock",
  group: "block",
  atom: true,
  selectable: true,

  addOptions() {
    return { editable: true }
  },

  addAttributes() {
    return {
      meetingId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-meeting-id"),
        renderHTML: (attributes) =>
          attributes.meetingId
            ? { "data-meeting-id": attributes.meetingId }
            : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="meetingBlock"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "meetingBlock" }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MeetingBlockView, {
      className: "meeting-block",
      stopEvent: ({ event }) =>
        event.target instanceof HTMLElement &&
        Boolean(event.target.closest(".meeting-block-shell")),
    })
  },
})
