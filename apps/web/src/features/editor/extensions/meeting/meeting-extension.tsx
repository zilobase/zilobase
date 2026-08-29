import { Node, mergeAttributes } from "@tiptap/core"
import { AllSelection, NodeSelection, TextSelection } from "@tiptap/pm/state"
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react"
import {
  useSyncExternalStore,
  type FocusEvent as ReactFocusEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"

import { MeetingView } from "./meeting-view"

type MeetingBlockOptions = {
  editable?: boolean
  editorRuntime?: {
    getEditable: () => boolean
    subscribe: (listener: () => void) => () => void
  }
}

function MeetingBlockView({ editor, extension, getPos, node }: ReactNodeViewProps) {
  const meetingId = node.attrs.meetingId as string | null
  const options = extension.options as MeetingBlockOptions
  const isEditable = useSyncExternalStore(
    options.editorRuntime?.subscribe ?? (() => () => {}),
    options.editorRuntime?.getEditable ??
      (() => options.editable !== false && editor.isEditable),
    options.editorRuntime?.getEditable ??
      (() => options.editable !== false && editor.isEditable),
  )

  const clearOuterBlockSelection = (target: EventTarget | null) => {
    if (
      !(target instanceof HTMLElement) ||
      !target.closest(".meeting-block-shell")
    ) {
      return
    }

    const pos = getPos()
    if (typeof pos !== "number") {
      return
    }

    const { doc, selection } = editor.state
    const meetingIsSelected =
      selection instanceof AllSelection ||
      (selection instanceof NodeSelection && selection.from === pos)

    if (!meetingIsSelected) {
      return
    }

    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.near(doc.resolve(pos), -1)),
    )
  }

  return (
    <NodeViewWrapper
      className="meeting-block"
      data-meeting-id={meetingId ?? undefined}
      data-type="meetingBlock"
      onFocusCapture={(event: ReactFocusEvent<HTMLDivElement>) =>
        clearOuterBlockSelection(event.target)
      }
      onPointerDownCapture={(event: ReactPointerEvent<HTMLDivElement>) =>
        clearOuterBlockSelection(event.target)
      }
    >
      {meetingId ? (
        <MeetingView editable={isEditable} meetingId={meetingId} />
      ) : (
        <div className="rounded-xl border p-4 text-sm text-content-secondary">
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
  draggable: false,
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
      stopEvent: ({ event }) => {
        const target = event.target
        return (
          target instanceof HTMLElement &&
          Boolean(target.closest(".meeting-block-shell"))
        )
      },
    })
  },
})
