import { Node, mergeAttributes } from "@tiptap/core"
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react"
import { CodeXml, FileWarning, Link, RefreshCw } from "lucide-react"
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type SVGProps,
} from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

type SetEmbedAttrs = {
  src: string
  title?: string | null
  width?: number | null
  provider?: EmbedProvider
}

const minEmbedWidth = 240
export type EmbedProvider = "figma" | "excalidraw" | "youtube" | "miro" | null

export function FigmaIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 38 57"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M19 28.5c0-5.247 4.253-9.5 9.5-9.5 5.247 0 9.5 4.253 9.5 9.5 0 5.247-4.253 9.5-9.5 9.5-5.247 0-9.5-4.253-9.5-9.5"
        fill="#00b6ff"
      />
      <path
        d="M0 47.5C0 42.253 4.253 38 9.5 38H19v9.5c0 5.247-4.253 9.5-9.5 9.5C4.253 57 0 52.747 0 47.5"
        fill="#24cb71"
      />
      <path
        d="M19 0v19h9.5c5.247 0 9.5-4.253 9.5-9.5C38 4.253 33.747 0 28.5 0z"
        fill="#ff7237"
      />
      <path
        d="M0 9.5C0 14.747 4.253 19 9.5 19H19V0H9.5C4.253 0 0 4.253 0 9.5"
        fill="#ff3737"
      />
      <path
        d="M0 28.5C0 33.747 4.253 38 9.5 38H19V19H9.5C4.253 19 0 23.253 0 28.5"
        fill="#874fff"
      />
    </svg>
  )
}

export function ExcalidrawIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1000 1000"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect fill="#fff" height="1000" rx="200" ry="200" width="1000" />
      <path
        d="M119.81 105.98a.549.549 0 0 0-.53-.12c-4.19-6.19-9.52-12.06-14.68-17.73l-.85-.93c0-.11-.05-.21-.12-.3a.548.548 0 0 0-.34-.2l-.17-.18-.12-.09c-.15-.32-.53-.56-.95-.35-1.58.81-3 1.97-4.4 3.04-1.87 1.43-3.7 2.92-5.42 4.52-.7.65-1.39 1.33-1.97 2.09-.28.37-.07.72.27.87-1.22 1.2-2.45 2.45-3.68 3.74-.11.12-.17.28-.16.44.01.16.09.31.22.41l2.16 1.65s.01.03.03.04c3.09 3.05 8.51 7.28 14.25 11.76.85.67 1.71 1.34 2.57 2.01.39.47.76.94 1.12 1.4.19.25.55.3.8.11.13.1.26.21.39.31a.57.57 0 0 0 .8-.1c.07-.09.1-.2.11-.31.04 0 .07.03.1.03.15 0 .31-.06.42-.18l10.18-11.12a.56.56 0 0 0-.04-.8l.01-.01Zm-29.23-3.85c.07.09.14.17.21.25 1.16.98 2.4 2.04 3.66 3.12l-5.12-3.91s-.32-.22-.52-.36c-.11-.08-.21-.16-.31-.24l-.38-.32s.07-.07.1-.11l.35-.35c1.72-1.74 4.67-4.64 6.19-6.06-1.61 1.62-4.87 6.37-4.17 7.98h-.01Zm17.53 13.81-4.22-3.22c-1.65-1.71-3.43-3.4-5.24-5.03 2.28 1.76 4.23 3.25 4.52 3.51 2.21 1.97 2.11 1.61 3.63 2.91l1.83 1.33c-.18.16-.36.33-.53.49l.01.01Zm1.06.81-.08-.06c.16-.13.33-.25.49-.38l-.4.44h-.01ZM42.24 51.45c.14.72.27 1.43.4 2.11.69 3.7 1.33 7.03 2.55 9.56l.48 1.92c.19.73.46 1.64.71 1.83 2.85 2.52 7.22 6.28 11.89 9.82.21.16.5.15.7-.01.01.02.03.03.04.04.11.1.24.15.38.15.16 0 .31-.06.42-.19 5.98-6.65 10.43-12.12 13.6-16.7.2-.25.3-.54.29-.84.2-.24.41-.48.6-.68a.558.558 0 0 0-.1-.86.578.578 0 0 0-.17-.36c-1.39-1.34-2.42-2.31-3.46-3.28-1.84-1.72-3.74-3.5-7.77-7.51-.02-.02-.05-.04-.07-.06a.555.555 0 0 0-.22-.14c-1.11-.39-3.39-.78-6.26-1.28-4.22-.72-10-1.72-15.2-3.27h-.04v-.01s-.02 0-.03.02h-.01l.04-.02s-.31.01-.37.04c-.08.04-.14.09-.19.15-.05.06-.09.12-.47.2-.38.08.08 0 .11 0h-.11v.03c.07.34.05.58.16.97-.02.1.21 1.02.24 1.11l1.83 7.26h.03Zm30.95 6.54s-.03.04-.04.05l-.64-.71c.22.21.44.42.68.66Zm-7.09 9.39s-.07.08-.1.12l-.02-.02c.04-.03.08-.07.13-.1h-.01Zm-7.07 8.47Zm3.02-28.57c.35.35 1.74 1.65 2.06 1.97-1.45-.66-5.06-2.34-6.74-2.88 1.65.29 3.93.66 4.68.91Zm-19.18-2.77c.84 1.44 1.5 6.49 2.16 11.4-.37-1.58-.69-3.12-.99-4.6-.52-2.56-1-4.85-1.67-6.88.14.01.31.03.49.05 0 .01 0 .02.02.03h-.01Zm-.29-1.21c-.23-.02-.44-.04-.62-.05-.02-.04-.03-.08-.04-.12l.66.18v-.01Zm-2.22.45v-.02.02ZM118.9 42.57c.04-.23-1.1-1.24-.74-1.26.85-.04.86-1.35 0-1.31-1.13.06-2.27.32-3.37.53-1.98.37-3.95.78-5.92 1.21-4.39.94-8.77 1.93-13.1 3.11-1.36.37-2.86.7-4.11 1.36-.42.22-.4.67-.17.95-.09.05-.18.08-.28.09-.37.07-.74.13-1.11.19a.566.566 0 0 0-.39.86c-2.32 3.1-4.96 6.44-7.82 9.95-2.81 3.21-5.73 6.63-8.72 10.14-9.41 11.06-20.08 23.6-31.9 34.64-.23.21-.24.57-.03.8.05.06.12.1.19.13-.16.15-.32.3-.48.44-.1.09-.14.2-.16.32-.08.08-.16.17-.23.25-.21.23-.2.59.03.8.23.21.59.2.8-.03.04-.04.08-.09.12-.13a.84.84 0 0 1 1.22 0c.69.74 1.34 1.44 1.95 2.09l-1.38-1.15a.57.57 0 0 0-.8.07c-.2.24-.17.6.07.8l14.82 12.43c.11.09.24.13.37.13.15 0 .29-.06.4-.17l.36-.36a.56.56 0 0 0 .63-.12c20.09-20.18 36.27-35.43 54.8-49.06.17-.12.25-.32.23-.51a.57.57 0 0 0 .48-.39c3.42-10.46 4.08-19.72 4.28-24.27 0-.03.01-.05.02-.07.02-.05.03-.1.04-.14.03-.11.05-.19.05-.19.26-.78.17-1.53-.15-2.15v.02ZM82.98 58.94c.9-1.03 1.79-2.04 2.67-3.02-5.76 7.58-15.3 19.26-28.81 33.14 9.2-10.18 18.47-20.73 26.14-30.12Zm-32.55 52.81-.03-.03c.11.02.19.04.2.04a.47.47 0 0 0-.17 0v-.01Zm6.9 6.42-.05-.04.03-.03c.02 0 .03.02.04.02 0 .02-.02.03-.03.05h.01Zm8.36-7.21 1.38-1.44c.01.01.02.03.03.05-.47.46-.94.93-1.42 1.39h.01Zm2.24-2.21c.26-.3.56-.65.87-1.02.01-.01.02-.03.04-.04 3.29-3.39 6.68-6.82 10.18-10.25.02-.02.05-.04.07-.06.86-.66 1.82-1.39 2.72-2.08-4.52 4.32-9.11 8.78-13.88 13.46v-.01Zm21.65-55.88c-1.86 2.42-3.9 5.56-5.63 8.07-5.46 7.91-23.04 27.28-23.43 27.65-2.71 2.62-10.88 10.46-16.09 15.37-.14.13-.25.24-.34.35a.794.794 0 0 1 .03-1.13c24.82-23.4 39.88-42.89 46-51.38-.13.33-.24.69-.55 1.09l.01-.02Zm16.51 7.1-.01.02c0-.02-.02-.07.01-.02Zm-.91-5.13Zm-5.89 9.45c-2.26-1.31-3.32-3.27-2.71-5.25l.19-.66c.08-.19.17-.38.28-.57.59-.98 1.49-1.85 2.52-2.36.05-.02.1-.03.15-.04a.795.795 0 0 1-.04-.43c.05-.31.25-.58.66-.58.67 0 2.75.62 3.54 1.3.24.19.47.4.68.63.3.35.74.92.96 1.33.13.06.23.62.38.91.14.46.2.93.18 1.4 0 .02 0 .02.01.03-.03.07 0 .37-.04.4-.1.72-.36 1.43-.75 2.05-.04.05-.07.11-.11.16 0 .01-.02.02-.03.04-.3.43-.65.83-1.08 1.13-1.26.89-2.73 1.16-4.2.79a6.33 6.33 0 0 1-.57-.25l-.02-.03Zm16.27-1.63c-.49 2.05-1.09 4.19-1.8 6.38-.03.08-.03.16-.03.23-.1.01-.19.05-.27.11-4.44 3.26-8.73 6.62-12.98 10.11 3.67-3.32 7.39-6.62 11.23-9.95a6.409 6.409 0 0 0 2.11-3.74l.56-3.37.03-.1c.25-.71 1.34-.4 1.17.33h-.02Z"
        fill="#6965db"
        fillRule="nonzero"
        transform="matrix(9.3458 0 0 9.901 -246.86 -292)"
      />
    </svg>
  )
}

export function YouTubeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 29 20"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <g>
        <path
          d="M14.4848 20C14.4848 20 23.5695 20 25.8229 19.4C27.0917 19.06 28.0459 18.08 28.3808 16.87C29 14.65 29 9.98 29 9.98C29 9.98 29 5.34 28.3808 3.14C28.0459 1.9 27.0917 0.94 25.8229 0.61C23.5695 0 14.4848 0 14.4848 0C14.4848 0 5.42037 0 3.17711 0.61C1.9286 0.94 0.954148 1.9 0.59888 3.14C0 5.34 0 9.98 0 9.98C0 9.98 0 14.65 0.59888 16.87C0.954148 18.08 1.9286 19.06 3.17711 19.4C5.42037 20 14.4848 20 14.4848 20Z"
          fill="#FF0033"
        />
        <path d="M19 10L11.5 5.75V14.25L19 10Z" fill="white" />
      </g>
    </svg>
  )
}

export function MiroIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 320 320"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M0 80C0 35.8172 35.8172 0 80 0H240C284.183 0 320 35.8172 320 80V240C320 284.183 284.183 320 240 320H80C35.8172 320 0 284.183 0 240V80Z"
        fill="#FFD02F"
      />
      <text
        dominantBaseline="central"
        fill="#050038"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="172"
        fontWeight="700"
        textAnchor="middle"
        x="160"
        y="170"
      >
        M
      </text>
    </svg>
  )
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    embedBlock: {
      setEmbed: (attrs: SetEmbedAttrs) => ReturnType
    }
  }
}

function extractIframeAttrs(value: string) {
  if (!value.trim().startsWith("<")) {
    return null
  }

  const parser = new DOMParser()
  const document = parser.parseFromString(value, "text/html")
  const iframe = document.querySelector("iframe[src]")

  if (!iframe) {
    return null
  }

  return {
    src: iframe.getAttribute("src") ?? "",
    title: iframe.getAttribute("title") || "Embedded content",
  }
}

function isFigmaFileUrl(url: URL) {
  const hostname = url.hostname.replace(/^www\./, "")

  return (
    hostname === "figma.com" &&
    ["/design/", "/file/", "/proto/"].some((path) =>
      url.pathname.startsWith(path)
    )
  )
}

function normalizeFigmaEmbedUrl(url: URL, title: string) {
  const hostname = url.hostname.replace(/^www\./, "")

  if (isFigmaFileUrl(url)) {
    return {
      provider: "figma" as const,
      src: `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(
        url.toString()
      )}`,
      title,
    }
  }

  if (hostname === "figma.com" && url.pathname === "/embed") {
    const embeddedUrl = url.searchParams.get("url")

    if (!embeddedUrl) {
      return null
    }

    try {
      if (!isFigmaFileUrl(new URL(embeddedUrl))) {
        return null
      }
    } catch {
      return null
    }

    return {
      provider: "figma" as const,
      src: url.toString(),
      title,
    }
  }

  return null
}

function isExcalidrawUrl(url: URL) {
  const hostname = url.hostname.replace(/^www\./, "")

  if (
    hostname === "excalidraw.com" ||
    hostname === "link.excalidraw.com" ||
    hostname === "plus.excalidraw.com"
  ) {
    return true
  }

  return false
}

function normalizeExcalidrawEmbedUrl(url: URL, title: string) {
  if (!isExcalidrawUrl(url)) {
    return null
  }

  return {
    provider: "excalidraw" as const,
    src: url.toString(),
    title,
  }
}

function normalizeYouTubeEmbedUrl(url: URL, title: string) {
  const hostname = url.hostname.replace(/^www\./, "")

  if (hostname === "youtu.be") {
    const videoId = url.pathname.split("/").filter(Boolean)[0]

    if (videoId) {
      return {
        provider: "youtube" as const,
        src: `https://www.youtube.com/embed/${videoId}`,
        title,
      }
    }
  }

  if (
    hostname === "youtube.com" ||
    hostname === "m.youtube.com" ||
    hostname === "youtube-nocookie.com"
  ) {
    const videoId = url.searchParams.get("v")

    if (videoId) {
      return {
        provider: "youtube" as const,
        src: `https://www.youtube.com/embed/${videoId}`,
        title,
      }
    }

    const [, embedType, embedId] = url.pathname.split("/")

    if ((embedType === "embed" || embedType === "shorts") && embedId) {
      return {
        provider: "youtube" as const,
        src: `https://www.youtube.com/embed/${embedId}`,
        title,
      }
    }
  }

  return null
}

function isMiroUrl(url: URL) {
  const hostname = url.hostname.replace(/^www\./, "")

  return hostname === "miro.com" || hostname.endsWith(".miro.com")
}

function normalizeMiroEmbedUrl(url: URL, title: string) {
  if (!isMiroUrl(url)) {
    return null
  }

  if (
    url.pathname.startsWith("/app/live-embed/") ||
    url.pathname.startsWith("/app/embed/")
  ) {
    return {
      provider: "miro" as const,
      src: url.toString(),
      title,
    }
  }

  if (url.pathname.startsWith("/app/board/")) {
    const boardId = url.pathname
      .replace(/^\/app\/board\//, "")
      .split("/")
      .filter(Boolean)[0]

    if (boardId) {
      url.pathname = `/app/live-embed/${boardId}/`

      return {
        provider: "miro" as const,
        src: url.toString(),
        title,
      }
    }
  }

  return null
}

export function normalizeEmbedUrl(
  value: string,
  options: { provider?: EmbedProvider } = {}
) {
  const trimmed = value.trim()

  if (!trimmed) {
    return null
  }

  const iframeAttrs = extractIframeAttrs(trimmed)
  const rawUrl = iframeAttrs?.src ?? trimmed
  const withProtocol = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`

  try {
    const url = new URL(withProtocol)

    if (!["http:", "https:"].includes(url.protocol)) {
      return null
    }

    const hostname = url.hostname.replace(/^www\./, "")
    const figmaEmbed = normalizeFigmaEmbedUrl(
      url,
      iframeAttrs?.title ?? "Figma embed"
    )

    if (figmaEmbed) {
      return figmaEmbed
    }

    const excalidrawEmbed = normalizeExcalidrawEmbedUrl(
      url,
      iframeAttrs?.title ?? "Excalidraw embed"
    )

    if (excalidrawEmbed) {
      return excalidrawEmbed
    }

    const youtubeEmbed = normalizeYouTubeEmbedUrl(
      url,
      iframeAttrs?.title ?? "YouTube embed"
    )

    if (youtubeEmbed) {
      return youtubeEmbed
    }

    const miroEmbed = normalizeMiroEmbedUrl(
      url,
      iframeAttrs?.title ?? "Miro embed"
    )

    if (miroEmbed) {
      return miroEmbed
    }

    if (options.provider === "figma") {
      return null
    }

    if (options.provider === "excalidraw") {
      return null
    }

    if (options.provider === "youtube") {
      return null
    }

    if (options.provider === "miro") {
      return null
    }

    if (hostname === "vimeo.com") {
      const videoId = url.pathname.split("/").filter(Boolean)[0]

      if (videoId) {
        return {
          src: `https://player.vimeo.com/video/${videoId}`,
          title: iframeAttrs?.title ?? "Vimeo embed",
        }
      }
    }

    return {
      src: url.toString(),
      title: iframeAttrs?.title ?? "Embedded content",
    }
  } catch {
    return null
  }
}

function EmbedBlockView({ editor, node, updateAttributes }: ReactNodeViewProps) {
  const resizeStateRef = useRef<{
    startX: number
    startWidth: number
    side: "left" | "right"
  } | null>(null)
  const src = node.attrs.src as string | null
  const title = (node.attrs.title as string | null) ?? "Embedded content"
  const width = node.attrs.width as number | null
  const provider = node.attrs.provider as EmbedProvider
  const isFigma = provider === "figma"
  const isExcalidraw = provider === "excalidraw"
  const isYouTube = provider === "youtube"
  const isMiro = provider === "miro"
  const frameLoadedRef = useRef(false)
  const [frameFailed, setFrameFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const [embedValue, setEmbedValue] = useState(src ?? "")
  const [error, setError] = useState<string | null>(null)
  const shouldShowFrame = Boolean(src && !frameFailed)

  useEffect(() => {
    frameLoadedRef.current = false
    setFrameFailed(false)

    if (!src) {
      return
    }

    const timeout = window.setTimeout(() => {
      if (!frameLoadedRef.current) {
        setFrameFailed(true)
      }
    }, 8000)

    return () => window.clearTimeout(timeout)
  }, [provider, src])

  const submitEmbed = () => {
    const nextEmbed = normalizeEmbedUrl(embedValue, { provider })

    if (!nextEmbed) {
      setError(
        isFigma
          ? "Paste a valid Figma design, file, prototype, or embed code."
          : isExcalidraw
            ? "Paste a valid Excalidraw link or embed code."
            : isYouTube
              ? "Paste a valid YouTube link or embed code."
              : isMiro
                ? "Paste a valid Miro board link or embed code."
          : "Paste a valid http(s) URL or iframe embed code."
      )
      return
    }

    updateAttributes({
      ...nextEmbed,
      provider:
        isFigma || ("provider" in nextEmbed && nextEmbed.provider === "figma")
          ? "figma"
          : isExcalidraw ||
              ("provider" in nextEmbed && nextEmbed.provider === "excalidraw")
            ? "excalidraw"
            : isYouTube ||
                ("provider" in nextEmbed && nextEmbed.provider === "youtube")
              ? "youtube"
              : isMiro ||
                  ("provider" in nextEmbed && nextEmbed.provider === "miro")
                ? "miro"
          : null,
    })
    setEmbedValue(nextEmbed.src)
    setError(null)
    setOpen(false)
  }

  const startResize = (
    event: PointerEvent<HTMLSpanElement>,
    side: "left" | "right"
  ) => {
    const preview = event.currentTarget.closest(".embed-block-preview")

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

  const updateResize = (event: PointerEvent<HTMLSpanElement>) => {
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
        Math.max(minEmbedWidth, resizeState.startWidth + delta)
      )
    )

    updateAttributes({ width: nextWidth })
  }

  const stopResize = (event: PointerEvent<HTMLSpanElement>) => {
    if (resizeStateRef.current) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    resizeStateRef.current = null
  }

  return (
    <NodeViewWrapper className="embed-block" data-src={src ? "true" : "false"}>
      <Popover onOpenChange={setOpen} open={open}>
        {!src ? (
          <PopoverTrigger asChild>
            <button
              className="media-block-placeholder"
              contentEditable={false}
              type="button"
            >
              {isFigma ? (
                <FigmaIcon />
              ) : isExcalidraw ? (
                <ExcalidrawIcon />
              ) : isYouTube ? (
                <YouTubeIcon />
              ) : isMiro ? (
                <MiroIcon />
              ) : (
                <CodeXml />
              )}
              <span>
                {isFigma
                  ? "Add a Figma embed"
                  : isExcalidraw
                    ? "Add an Excalidraw embed"
                    : isYouTube
                      ? "Add a YouTube embed"
                      : isMiro
                        ? "Add a Miro embed"
                    : "Embed a URL or iframe"}
              </span>
            </button>
          </PopoverTrigger>
        ) : null}
        <PopoverContent
          align="start"
          className="w-[min(30rem,calc(100vw-2rem))] p-4"
          onMouseDown={(event) => {
            event.stopPropagation()
          }}
          onPointerDown={(event) => {
            event.stopPropagation()
          }}
          side="bottom"
          sideOffset={8}
        >
          <div className="flex items-center gap-2">
            {isFigma ? (
              <FigmaIcon className="size-4 shrink-0" />
            ) : isExcalidraw ? (
              <ExcalidrawIcon className="size-4 shrink-0" />
            ) : isYouTube ? (
              <YouTubeIcon className="size-4 shrink-0" />
            ) : isMiro ? (
              <MiroIcon className="size-4 shrink-0" />
            ) : (
              <Link className="size-4 text-muted-foreground" />
            )}
            <Input
              autoComplete="off"
              onChange={(event) => {
                setEmbedValue(event.target.value)
                setError(null)
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  submitEmbed()
                }
              }}
              placeholder={
                isFigma
                  ? "Paste Figma link or embed code..."
                  : isExcalidraw
                    ? "Paste Excalidraw link or embed code..."
                    : isYouTube
                      ? "Paste YouTube link or embed code..."
                      : isMiro
                        ? "Paste Miro link or embed code..."
                  : "Paste URL or iframe code..."
              }
              value={embedValue}
            />
            <Button onClick={submitEmbed} type="button">
              Add
            </Button>
          </div>
          {error ? (
            <p className="mt-2 text-xs text-destructive">{error}</p>
          ) : null}
        </PopoverContent>
        {src ? (
          <div
            className="embed-block-preview"
            contentEditable={false}
            style={width ? { width: `${width}px` } : undefined}
          >
            <span
              aria-hidden="true"
              className="image-block-resize-handle image-block-resize-handle-left"
              onPointerDown={(event) => startResize(event, "left")}
              onPointerMove={updateResize}
              onPointerUp={stopResize}
            />
            {shouldShowFrame ? (
              <iframe
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                loading="lazy"
                onError={() => setFrameFailed(true)}
                onLoad={() => {
                  frameLoadedRef.current = true
                  setFrameFailed(false)
                }}
                sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts allow-storage-access-by-user-activation"
                src={src}
                title={title}
              />
            ) : (
              <div className="embed-block-failed">
                <FileWarning />
                <span className="embed-block-failed-title">
                  Failed to load embed
                </span>
                <span className="embed-block-failed-description">
                  Some websites prohibit their content from being embedded
                  elsewhere.
                </span>
                <a href={src} rel="noreferrer" target="_blank">
                  Open link
                </a>
              </div>
            )}
            <span
              aria-hidden="true"
              className="image-block-resize-handle image-block-resize-handle-right"
              onPointerDown={(event) => startResize(event, "right")}
              onPointerMove={updateResize}
              onPointerUp={stopResize}
            />
            <PopoverTrigger asChild>
              <Button
                className="embed-block-edit"
                size="icon"
                type="button"
                variant="secondary"
              >
                <RefreshCw />
                <span className="sr-only">Change embed</span>
              </Button>
            </PopoverTrigger>
          </div>
        ) : null}
      </Popover>
    </NodeViewWrapper>
  )
}

export const EmbedBlock = Node.create({
  name: "embedBlock",

  group: "block",

  atom: true,

  draggable: true,

  selectable: true,

  addAttributes() {
    return {
      src: {
        default: null,
      },
      title: {
        default: null,
      },
      provider: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-provider"),
        renderHTML: (attributes) =>
          attributes.provider ? { "data-provider": attributes.provider } : {},
      },
      width: {
        default: null,
        parseHTML: (element) => {
          const width =
            element.getAttribute("data-width") ?? element.getAttribute("width")

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
        tag: 'div[data-type="embedBlock"]',
      },
      {
        tag: "iframe[src]",
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) {
            return false
          }

          return {
            provider: element.getAttribute("data-provider"),
            src: element.getAttribute("src"),
            title: element.getAttribute("title"),
            width: element.getAttribute("width")
              ? Number.parseInt(element.getAttribute("width") ?? "", 10)
              : null,
          }
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "embedBlock" }),
    ]
  },

  addCommands() {
    return {
      setEmbed:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs,
          }),
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmbedBlockView)
  },
})
