import { Node, mergeAttributes } from "@tiptap/core"
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react"
import { Image as ImageIcon } from "lucide-react"
import { useRef, useState } from "react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ImageSourcePicker } from "@/packages/editor/components/image-source-picker"

const minImageWidth = 160

function ImageBlockView({
  editor,
  extension,
  node,
  updateAttributes,
}: ReactNodeViewProps) {
  const options = extension.options as ImageBlockOptions
  const resizeStateRef = useRef<{
    startX: number
    startWidth: number
    side: "left" | "right"
  } | null>(null)
  const [open, setOpen] = useState(false)
  const src = node.attrs.src as string | null
  const alt = (node.attrs.alt as string | null) ?? "Image"
  const width = node.attrs.width as number | null

  const setImageSrc = (nextSrc: string) => {
    updateAttributes({
      src: nextSrc,
      alt: alt === "Image" ? "Uploaded image" : alt,
    })
    setOpen(false)
  }

  const startResize = (
    event: React.PointerEvent<HTMLSpanElement>,
    side: "left" | "right"
  ) => {
    const preview = event.currentTarget.closest(".image-block-preview")

    if (!(preview instanceof HTMLElement)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeStateRef.current = {
      side,
      startX: event.clientX,
      startWidth: preview.getBoundingClientRect().width,
    }
  }

  const updateResize = (event: React.PointerEvent<HTMLSpanElement>) => {
    const resizeState = resizeStateRef.current

    if (!resizeState) {
      return
    }

    const editorWidth = editor.view.dom.clientWidth
    const delta =
      resizeState.side === "right"
        ? event.clientX - resizeState.startX
        : resizeState.startX - event.clientX
    const nextWidth = Math.round(
      Math.min(
        editorWidth,
        Math.max(minImageWidth, resizeState.startWidth + delta)
      )
    )

    updateAttributes({ width: nextWidth })
  }

  const stopResize = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (resizeStateRef.current) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    resizeStateRef.current = null
  }

  return (
    <NodeViewWrapper className="image-block" data-src={src ? "true" : "false"}>
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <button
            className="image-block-placeholder"
            contentEditable={false}
            disabled={Boolean(src)}
            type="button"
          >
            <ImageIcon />
            <span>Add an image</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(42rem,calc(100vw-2rem))] p-4"
          onMouseDown={(event) => {
            event.stopPropagation()
          }}
          onPointerDown={(event) => {
            event.stopPropagation()
          }}
          side="bottom"
          sideOffset={8}
        >
          <ImageSourcePicker
            initialLinkUrl={src ?? ""}
            onSelect={setImageSrc}
            workspaceId={options.workspaceId}
            pageId={options.pageId}
          />
        </PopoverContent>
      </Popover>
      {src ? (
        <button
          aria-label="Image"
          className="image-block-preview"
          contentEditable={false}
          style={width ? { width: `${width}px` } : undefined}
          type="button"
        >
          <span
            aria-hidden="true"
            className="image-block-resize-handle image-block-resize-handle-left"
            onPointerDown={(event) => startResize(event, "left")}
            onPointerMove={updateResize}
            onPointerUp={stopResize}
          />
          <img alt={alt} src={src} title={node.attrs.title ?? undefined} />
          <span
            aria-hidden="true"
            className="image-block-resize-handle image-block-resize-handle-right"
            onPointerDown={(event) => startResize(event, "right")}
            onPointerMove={updateResize}
            onPointerUp={stopResize}
          />
        </button>
      ) : null}
    </NodeViewWrapper>
  )
}

type ImageBlockOptions = {
  workspaceId?: string | null
  pageId?: string | null
}

export const ImageBlock = Node.create<ImageBlockOptions>({
  name: "imageBlock",

  group: "block",

  atom: true,

  draggable: true,

  selectable: true,

  addOptions() {
    return {
      workspaceId: null,
      pageId: null,
    }
  },

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-src") ?? element.getAttribute("src"),
        renderHTML: (attributes) =>
          attributes.src ? { "data-src": attributes.src } : {},
      },
      alt: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-alt") ?? element.getAttribute("alt"),
        renderHTML: (attributes) =>
          attributes.alt ? { "data-alt": attributes.alt } : {},
      },
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-title"),
        renderHTML: (attributes) =>
          attributes.title ? { "data-title": attributes.title } : {},
      },
      width: {
        default: null,
        parseHTML: (element) => {
          const width = element.getAttribute("data-width")

          return width ? Number.parseInt(width, 10) : null
        },
        renderHTML: (attributes) =>
          attributes.width ? { "data-width": attributes.width } : {},
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="imageBlock"]',
      },
      {
        tag: "img[src]",
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    if (!HTMLAttributes.src) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, { "data-type": "imageBlock" }),
      ]
    }

    return [
      "img",
      mergeAttributes(HTMLAttributes, {
        "data-type": "imageBlock",
      }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageBlockView)
  },
})