import { Node, mergeAttributes } from "@tiptap/core"
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react"
import { Link, PlaySquare } from "@/shared/components/icons"
import { useRef, useState } from "react"

import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/app-tabs"

function VideoBlockView({ node, updateAttributes }: ReactNodeViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [open, setOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState(node.attrs.src ?? "")
  const src = node.attrs.src as string | null
  const title = (node.attrs.title as string | null) ?? "Video"

  const setVideoSrc = (nextSrc: string, nextTitle = "Linked video") => {
    updateAttributes({
      src: nextSrc,
      title: nextTitle,
    })
    setLinkUrl(nextSrc)
    setOpen(false)
  }

  const readFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith("video/")) {
      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === "string") {
        setVideoSrc(reader.result, file.name)
      }
    }

    reader.readAsDataURL(file)
  }

  const submitLink = () => {
    const nextUrl = linkUrl.trim()

    if (nextUrl) {
      setVideoSrc(nextUrl)
    }
  }

  return (
    <NodeViewWrapper className="video-block" data-src={src ? "true" : "false"}>
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <button
            className="flex h-10 w-full items-center gap-2 rounded-md bg-surface-subtle px-3 text-left text-sm font-medium text-content-secondary transition-colors hover:bg-action-neutral-hover hover:text-action-on-neutral active:bg-action-neutral-pressed active:text-action-on-neutral focus-visible:ring-2 focus-visible:ring-action-focus-ring focus-visible:outline-none disabled:hidden [&_svg]:size-4 [&_svg]:shrink-0"
            contentEditable={false}
            disabled={Boolean(src)}
            type="button"
          >
            <PlaySquare />
            <span>Embed or upload a video</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0"
          onMouseDown={(event) => {
            event.stopPropagation()
          }}
          onPointerDown={(event) => {
            event.stopPropagation()
          }}
          side="bottom"
          sideOffset={8}
        >
          <Tabs defaultValue="upload">
            <TabsList className="w-full justify-start rounded-none border-b px-2">
              <TabsTrigger value="upload">Upload</TabsTrigger>
              <TabsTrigger value="link">Link</TabsTrigger>
            </TabsList>
            <TabsContent className="p-4" value="upload">
              <Button
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                Choose a video
              </Button>
              <input
                accept="video/*"
                className="sr-only"
                onChange={(event) => readFile(event.target.files?.[0])}
                ref={fileInputRef}
                type="file"
              />
            </TabsContent>
            <TabsContent className="p-4" value="link">
              <div className="flex items-center gap-2">
                <Link className="size-4 text-content-secondary" />
                <Input
                  autoComplete="off"
                  onChange={(event) => setLinkUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      submitLink()
                    }
                  }}
                  placeholder="Paste video URL..."
                  value={linkUrl}
                />
                <Button onClick={submitLink} type="button">
                  Add
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </PopoverContent>
      </Popover>
      {src ? (
        <div
          className="overflow-hidden rounded-md border bg-surface-muted [&_video]:block [&_video]:max-h-[520px] [&_video]:w-full [&_video]:bg-data-media"
          contentEditable={false}
        >
          <video controls src={src} title={title} />
        </div>
      ) : null}
    </NodeViewWrapper>
  )
}

export const VideoBlock = Node.create({
  name: "videoBlock",

  group: "block",

  atom: true,

  draggable: true,

  selectable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-src") ?? element.getAttribute("src"),
        renderHTML: (attributes) =>
          attributes.src ? { "data-src": attributes.src } : {},
      },
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-title"),
        renderHTML: (attributes) =>
          attributes.title ? { "data-title": attributes.title } : {},
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="videoBlock"]',
      },
      {
        tag: "video[src]",
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "videoBlock" }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoBlockView)
  },
})
