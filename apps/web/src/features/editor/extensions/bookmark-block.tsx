import { Node, mergeAttributes } from "@tiptap/core"
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react"
import { Bookmark, CircleX, Globe2, Loader2 } from "@/shared/components/icons"
import { useState } from "react"

import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover"
import { apiFetch } from "@/features/desktop/network/api"

export type BookmarkMetadata = {
  description: string | null
  favicon: string | null
  image: string | null
  title: string
}

function BookmarkBlockView({ node, updateAttributes }: ReactNodeViewProps) {
  const [faviconFailed, setFaviconFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [url, setUrl] = useState(node.attrs.href ?? "")
  const href = node.attrs.href as string | null
  const title = (node.attrs.title as string | null) ?? "Web bookmark"
  const description = node.attrs.description as string | null
  const favicon = node.attrs.favicon as string | null
  const host = href ? getUrlHost(href) : null
  const image = node.attrs.image as string | null

  const createBookmark = async () => {
    const nextUrl = normalizeUrl(url)

    if (!nextUrl) {
      return
    }

    const fallbackMetadata = getFallbackBookmarkMetadata(nextUrl)

    updateAttributes({
      ...fallbackMetadata,
      href: nextUrl,
    })
    setFaviconFailed(false)
    setUrl(nextUrl)
    setIsLoading(true)

    try {
      const metadata = await fetchBookmarkMetadata(nextUrl)

      updateAttributes({
        ...fallbackMetadata,
        ...metadata,
        href: nextUrl,
      })
      setFaviconFailed(false)
      setOpen(false)
    } catch {
      setOpen(false)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <NodeViewWrapper
      className="bookmark-block"
      data-src={href ? "true" : "false"}
    >
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <button
            className="flex h-10 w-full items-center gap-2 rounded-md bg-subtle-surface px-3 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground active:bg-active active:text-active-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:hidden [&_svg]:size-4 [&_svg]:shrink-0"
            contentEditable={false}
            disabled={Boolean(href)}
            type="button"
          >
            <Bookmark />
            <span>Add a web bookmark</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(24rem,calc(100vw-2rem))] gap-3 p-3"
          onMouseDown={(event) => {
            event.stopPropagation()
          }}
          onPointerDown={(event) => {
            event.stopPropagation()
          }}
          side="bottom"
          sideOffset={8}
        >
          <div className="relative">
            <Input
              autoComplete="off"
              autoFocus
              className="pr-8"
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  void createBookmark()
                }
              }}
              placeholder="Paste bookmark URL..."
              value={url}
            />
            {url ? (
              <button
                aria-label="Clear URL"
                className="absolute right-2 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-4"
                onClick={() => setUrl("")}
                type="button"
              >
                <CircleX />
              </button>
            ) : null}
          </div>
          <Button disabled={isLoading} onClick={createBookmark} type="button">
            {isLoading ? (
              <>
                <Loader2 className="animate-spin" />
                Creating...
              </>
            ) : (
              "Create bookmark"
            )}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Create a visual bookmark from a link.
          </p>
        </PopoverContent>
      </Popover>
      {href ? (
        <a
          className="grid overflow-hidden rounded-md bg-subtle-surface text-card-foreground no-underline transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[image=true]:grid-cols-[minmax(0,1fr)_minmax(12rem,35%)] data-[image=true]:grid-rows-[10rem]"
          contentEditable={false}
          data-image={image ? "true" : "false"}
          href={href}
          rel="noreferrer"
          target="_blank"
        >
          <span className="flex min-w-0 flex-col justify-center gap-3 p-5">
            <span className="min-w-0 truncate text-base font-semibold leading-snug">
              {title}
            </span>
            {description ? (
              <span className="line-clamp-2 text-sm leading-snug text-muted-foreground">
                {description}
              </span>
            ) : null}
            <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground [&>span:last-child]:truncate">
              {favicon && !faviconFailed ? (
                <img
                  alt=""
                  className="size-5 shrink-0 rounded-full"
                  onError={() => setFaviconFailed(true)}
                  src={favicon}
                />
              ) : (
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-3.5">
                  <Globe2 />
                </span>
              )}
              <span>{host ?? href}</span>
            </span>
          </span>
          {image ? (
            <span className="flex h-full items-center justify-center overflow-hidden bg-muted">
              <img alt="" className="size-full object-cover" src={image} />
            </span>
          ) : null}
        </a>
      ) : null}
    </NodeViewWrapper>
  )
}

function normalizeUrl(value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    return null
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  return `https://${trimmed}`
}

function getUrlHost(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

function getUrlTitle(value: string) {
  const host = getUrlHost(value)

  if (!host) {
    return value
  }

  return host
    .split(".")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function getFallbackBookmarkMetadata(value: string): BookmarkMetadata {
  const host = getUrlHost(value)

  return {
    description: host ?? null,
    favicon: getFallbackFavicon(value),
    image: null,
    title: getUrlTitle(value),
  }
}

export async function fetchBookmarkMetadata(value: string) {
  return apiFetch<BookmarkMetadata>(
    `/metadata/bookmark?url=${encodeURIComponent(value)}`
  )
}

function getFallbackFavicon(value: string) {
  try {
    return new URL("/favicon.ico", value).toString()
  } catch {
    return null
  }
}

export const BookmarkBlock = Node.create({
  name: "bookmarkBlock",

  group: "block",

  atom: true,

  draggable: true,

  selectable: true,

  addAttributes() {
    return {
      description: {
        default: null,
      },
      favicon: {
        default: null,
      },
      href: {
        default: null,
      },
      image: {
        default: null,
      },
      title: {
        default: null,
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="bookmarkBlock"]',
      },
      {
        tag: 'a[data-type="bookmarkBlock"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "bookmarkBlock" }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(BookmarkBlockView)
  },
})
