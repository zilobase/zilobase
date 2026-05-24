import { Node, mergeAttributes } from "@tiptap/core"
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react"
import { Bookmark, CircleX, Globe2, Loader2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

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

    const fallbackMetadata = getFallbackMetadata(nextUrl)

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
            className="media-block-placeholder"
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
                className="bookmark-block-clear"
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
          className="bookmark-block-preview"
          contentEditable={false}
          href={href}
          rel="noreferrer"
          target="_blank"
        >
          <span className="bookmark-block-content">
            <span className="bookmark-block-title-row">
              {favicon && !faviconFailed ? (
                <img
                  alt=""
                  className="bookmark-block-favicon"
                  onError={() => setFaviconFailed(true)}
                  src={favicon}
                />
              ) : (
                <span className="bookmark-block-favicon-fallback">
                  <Globe2 />
                </span>
              )}
              <span className="bookmark-block-title">{title}</span>
            </span>
            {description ? (
              <span className="bookmark-block-description">{description}</span>
            ) : null}
            <span className="bookmark-block-url">{host ?? href}</span>
          </span>
          <span className="bookmark-block-thumbnail">
            {image ? <img alt="" src={image} /> : <Bookmark />}
          </span>
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

function getFallbackMetadata(value: string) {
  const host = getUrlHost(value)

  return {
    description: `Create a visual bookmark from ${host ?? "a link"}.`,
    favicon: getFallbackFavicon(value),
    image: null,
    title: getUrlTitle(value),
  }
}

async function fetchBookmarkMetadata(value: string) {
  const response = await fetch(value)

  if (!response.ok) {
    throw new Error("Unable to fetch bookmark metadata")
  }

  const html = await response.text()
  const document = new DOMParser().parseFromString(html, "text/html")

  return {
    description:
      getMetaContent(document, "og:description") ??
      getMetaContent(document, "twitter:description") ??
      getMetaContent(document, "description"),
    favicon:
      resolveUrl(
        getLinkHref(document, "icon") ??
          getLinkHref(document, "shortcut icon") ??
          getLinkHref(document, "apple-touch-icon"),
        value
      ) ?? getFallbackFavicon(value),
    image:
      resolveUrl(
        getMetaContent(document, "og:image") ??
          getMetaContent(document, "twitter:image"),
        value
      ) ?? null,
    title:
      getMetaContent(document, "og:title") ??
      getMetaContent(document, "twitter:title") ??
      document.querySelector("title")?.textContent?.trim() ??
      getUrlTitle(value),
  }
}

function getMetaContent(document: Document, name: string) {
  return (
    document
      .querySelector(`meta[property="${name}"]`)
      ?.getAttribute("content")
      ?.trim() ??
    document.querySelector(`meta[name="${name}"]`)?.getAttribute("content")?.trim() ??
    null
  )
}

function getLinkHref(document: Document, rel: string) {
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>("link[rel]"))
  const match = links.find(
    (link) => link.rel.toLowerCase() === rel.toLowerCase()
  )

  return match?.getAttribute("href")?.trim() || null
}

function getFallbackFavicon(value: string) {
  try {
    return new URL("/favicon.ico", value).toString()
  } catch {
    return null
  }
}

function resolveUrl(value: string | null | undefined, baseUrl: string) {
  if (!value) {
    return null
  }

  try {
    return new URL(value, baseUrl).toString()
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
