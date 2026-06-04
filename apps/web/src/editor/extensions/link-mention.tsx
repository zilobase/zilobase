import { Node, mergeAttributes } from "@tiptap/core"
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react"
import { Globe2 } from "lucide-react"
import { useState } from "react"

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"

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
        className="link-mention-favicon"
        onError={() => setFaviconFailed(true)}
        src={favicon}
      />
    ) : (
      <span className="link-mention-favicon-fallback">
        <Globe2 />
      </span>
    )

  return (
    <NodeViewWrapper
      as="span"
      className="link-mention"
      contentEditable={false}
    >
      <HoverCard closeDelay={100} openDelay={250}>
        <HoverCardTrigger asChild>
          <a
            className="link-mention-trigger"
            href={href}
            rel="noreferrer"
            target="_blank"
          >
            {renderFavicon()}
            <span className="link-mention-text">{title}</span>
          </a>
        </HoverCardTrigger>
        <HoverCardContent
          align="start"
          className="link-mention-card"
          side="bottom"
          sideOffset={6}
        >
          {image ? (
            <span className="link-mention-card-image">
              <img alt="" src={image} />
            </span>
          ) : null}
          <span className="link-mention-card-body">
            <span className="link-mention-card-title">{title}</span>
            {description ? (
              <span className="link-mention-card-description">
                {description}
              </span>
            ) : null}
            <span className="link-mention-card-url">
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
