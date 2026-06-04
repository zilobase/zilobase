import { Node, mergeAttributes } from "@tiptap/core"
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react"
import {
  FileImage,
  Image as ImageIcon,
  Link,
  Search,
  Sparkles,
  Upload,
} from "lucide-react"
import { useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"

const minImageWidth = 160

const aiImageOptions = [
  { label: "Photo", icon: ImageIcon },
  { label: "Slides", icon: FileImage },
  { label: "Diagram", icon: Sparkles },
  { label: "Chart", icon: Sparkles },
  { label: "Mockup", icon: FileImage },
]

function ImageBlockView({ editor, node, updateAttributes }: ReactNodeViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const resizeStateRef = useRef<{
    startX: number
    startWidth: number
    side: "left" | "right"
  } | null>(null)
  const [open, setOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState(node.attrs.src ?? "")
  const [searchQuery, setSearchQuery] = useState("")
  const src = node.attrs.src as string | null
  const alt = (node.attrs.alt as string | null) ?? "Image"
  const width = node.attrs.width as number | null

  const setImageSrc = (nextSrc: string) => {
    updateAttributes({
      src: nextSrc,
      alt: alt === "Image" ? "Uploaded image" : alt,
    })
    setLinkUrl(nextSrc)
    setOpen(false)
  }

  const readFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) {
      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === "string") {
        updateAttributes({
          src: reader.result,
          alt: file.name,
          title: file.name,
        })
        setLinkUrl(reader.result)
        setOpen(false)
      }
    }

    reader.readAsDataURL(file)
  }

  const submitLink = () => {
    const nextUrl = linkUrl.trim()

    if (nextUrl) {
      setImageSrc(nextUrl)
    }
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
          <Tabs className="gap-4" defaultValue="add">
            <TabsList variant="line">
              <TabsTrigger value="add">Add</TabsTrigger>
              <TabsTrigger value="link">Link</TabsTrigger>
              <TabsTrigger value="unsplash">
                <Upload />
                Unsplash
              </TabsTrigger>
              <TabsTrigger value="giphy">
                <FileImage />
                GIPHY
              </TabsTrigger>
            </TabsList>

            <TabsContent className="space-y-4" value="add">
              <Button
                className="h-40 w-full flex-col gap-2 border-dashed"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault()
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  readFile(event.dataTransfer.files[0])
                }}
                size="lg"
                type="button"
                variant="outline"
              >
                <ImageIcon />
                <span>Upload image</span>
                <span className="text-muted-foreground">
                  Or drag and drop here
                </span>
              </Button>
              <input
                accept="image/*"
                className="sr-only"
                onChange={(event) => readFile(event.target.files?.[0])}
                ref={fileInputRef}
                type="file"
              />

              <Card>
                <CardHeader>
                  <CardTitle>Create with AI</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {aiImageOptions.map((option) => (
                    <Button
                      className="h-20 flex-col"
                      key={option.label}
                      type="button"
                      variant="outline"
                    >
                      <option.icon />
                      {option.label}
                    </Button>
                  ))}
                  </div>
                  <div className="flex items-center gap-2 rounded-md border p-2">
                    <Sparkles className="size-4 text-muted-foreground" />
                    <Input
                      className="border-0 bg-transparent focus-visible:ring-0"
                      placeholder="Or describe your idea..."
                    />
                    <Badge variant="secondary">Beta</Badge>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent className="space-y-3" value="link">
              <div className="flex items-center gap-2">
                <Link className="size-4 text-muted-foreground" />
                <Input
                  autoComplete="off"
                  onChange={(event) => setLinkUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      submitLink()
                    }
                  }}
                  placeholder="Paste image URL..."
                  value={linkUrl}
                />
                <Button onClick={submitLink} type="button">
                  Add
                </Button>
              </div>
            </TabsContent>

            <TabsContent className="space-y-3" value="unsplash">
              <div className="flex items-center gap-2">
                <Search className="size-4 text-muted-foreground" />
                <Input
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search Unsplash..."
                  value={searchQuery}
                />
              </div>
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                Unsplash search is ready for an API key.
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent className="space-y-3" value="giphy">
              <div className="flex items-center gap-2">
                <Search className="size-4 text-muted-foreground" />
                <Input
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search GIPHY..."
                  value={searchQuery}
                />
              </div>
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                GIPHY search is ready for an API key.
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
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

export const ImageBlock = Node.create({
  name: "imageBlock",

  group: "block",

  atom: true,

  draggable: true,

  selectable: true,

  addAttributes() {
    return {
      src: {
        default: null,
      },
      alt: {
        default: null,
      },
      title: {
        default: null,
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
