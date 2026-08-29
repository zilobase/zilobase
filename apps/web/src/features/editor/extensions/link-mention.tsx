import { Node, mergeAttributes } from "@tiptap/core"
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react"
import { Globe2 } from "@/shared/components/icons"
import { useState } from "react"

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/shared/ui/hover-card"

function LinkMentionView({ node }: ReactNodeViewProps) {
  const [faviconFailed, setFaviconFailed] = useState(false)
  const href = node.attrs.href as string
  const title = (node.attrs.title as string | null) ?? href
  const description = node.attrs.description as string | null
  const favicon = node.attrs.favicon as string | null
  const image = node.attrs.image as string | null
  const host = getUrlHost(href) ?? href

  const renderFavicon = () =>
    favicon && !faviconFailed ? (
      <img
        alt=""
        className="size-4 shrink-0 rounded-full"
        onError={() => setFaviconFailed(true)}
        src={favicon}
      />
    ) : (
      <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-surface-canvas text-content-secondary [&_svg]:size-3">
        <Globe2 />
      </span>
    )

  return (
    <NodeViewWrapper
      as="span"
      className="link-mention inline-flex max-w-full align-baseline"
      contentEditable={false}
    >
      <HoverCard closeDelay={100} openDelay={250}>
        <HoverCardTrigger asChild>
          <a
            className="inline-flex max-w-full items-center gap-1.5 rounded-sm bg-surface-muted px-1.5 py-0.5 text-sm font-medium text-content-primary no-underline transition-colors hover:bg-action-neutral-hover"
            href={href}
            rel="noreferrer"
            target="_blank"
          >
            {renderFavicon()}
            <span className="min-w-0 truncate">{title}</span>
          </a>
        </HoverCardTrigger>
        <HoverCardContent
          align="start"
          className="w-80 overflow-hidden p-0"
          side="bottom"
          sideOffset={6}
        >
          {image ? (
            <span className="block h-36 overflow-hidden bg-surface-muted">
              <img alt="" className="size-full object-cover" src={image} />
            </span>
          ) : null}
          <span className="flex flex-col gap-2.5 p-4">
            <span className="line-clamp-2 text-base font-semibold leading-snug text-content-primary">
              {title}
            </span>
            {description ? (
              <span className="line-clamp-3 text-sm leading-snug text-content-secondary">
                {description}
              </span>
            ) : null}
            <span className="mt-1 flex min-w-0 items-center gap-2 text-sm font-medium text-content-secondary [&>span:last-child]:truncate">
              {renderFavicon()}
              <span>{host}</span>
            </span>
          </span>
        </HoverCardContent>
      </HoverCard>
    </NodeViewWrapper>
  )
}

function getUrlHost(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

export const LinkMention = Node.create({
  name: "linkMention",

  group: "inline",

  inline: true,

  atom: true,

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
        tag: 'span[data-type="linkMention"]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-type": "linkMention" }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(LinkMentionView)
  },
})
