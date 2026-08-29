import { Node, mergeAttributes } from "@tiptap/core"
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react"
import { File as FileIcon, Link } from "@/shared/components/icons"
import { useRef, useState } from "react"

import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/app-tabs"

function FileBlockView({ node, updateAttributes }: ReactNodeViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [open, setOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState(node.attrs.href ?? "")
  const href = node.attrs.href as string | null
  const title = (node.attrs.title as string | null) ?? "File"
  const size = node.attrs.size as string | null

  const setFileHref = (
    nextHref: string,
    nextTitle = nextHref,
    nextSize: string | null = null
  ) => {
    updateAttributes({
      href: nextHref,
      size: nextSize,
      title: nextTitle,
    })
    setLinkUrl(nextHref)
    setOpen(false)
  }

  const readFile = (file: File | undefined) => {
    if (!file) {
      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === "string") {
        setFileHref(reader.result, file.name, formatFileSize(file.size))
      }
    }

    reader.readAsDataURL(file)
  }

  const submitLink = () => {
    const nextUrl = linkUrl.trim()

    if (nextUrl) {
      setFileHref(nextUrl)
    }
  }

  return (
    <NodeViewWrapper className="file-block" data-src={href ? "true" : "false"}>
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <button
            className="flex h-10 w-full items-center gap-2 rounded-md bg-surface-subtle px-3 text-left text-sm font-medium text-content-secondary transition-colors hover:bg-action-neutral-hover hover:text-action-on-neutral active:bg-action-neutral-pressed active:text-action-on-neutral focus-visible:ring-2 focus-visible:ring-action-focus-ring focus-visible:outline-none disabled:hidden [&_svg]:size-4 [&_svg]:shrink-0"
            contentEditable={false}
            disabled={Boolean(href)}
            type="button"
          >
            <FileIcon />
            <span>Upload or link a file</span>
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
                Choose a file
              </Button>
              <input
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
                  placeholder="Paste file URL..."
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
      {href ? (
        <a
          className="flex items-center gap-3 rounded-md border bg-surface-subtle px-3 py-2 text-sm text-content-primary no-underline transition-colors hover:bg-action-neutral-hover focus-visible:ring-2 focus-visible:ring-action-focus-ring focus-visible:outline-none [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-content-secondary"
          contentEditable={false}
          download
          href={href}
          rel="noreferrer"
          target="_blank"
        >
          <FileIcon />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">
              {title}
            </span>
            {size ? (
              <span className="block text-xs text-content-secondary">
                {size}
              </span>
            ) : null}
          </span>
        </a>
      ) : null}
    </NodeViewWrapper>
  )
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 102.4) / 10} KB`
  }

  return `${Math.round(size / 1024 / 102.4) / 10} MB`
}

export const FileBlock = Node.create({
  name: "fileBlock",

  group: "block",

  atom: true,

  draggable: true,

  selectable: true,

  addAttributes() {
    return {
      href: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-href") ?? element.getAttribute("href"),
        renderHTML: (attributes) =>
          attributes.href ? { "data-href": attributes.href } : {},
      },
      size: {
        default: null,
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
        tag: 'div[data-type="fileBlock"]',
      },
      {
        tag: 'a[data-type="fileBlock"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "fileBlock" }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(FileBlockView)
  },
})
