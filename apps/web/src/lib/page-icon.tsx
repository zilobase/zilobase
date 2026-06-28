import { FileIcon, FileTextIcon } from "lucide-react"

import { getPageEmoji, type Page } from "@notelab/features/pages"
import { getDatabaseEmoji } from "@notelab/features/databases"
import { getIconSolidClassName } from "@/lib/color-tokens"
import { cn } from "@/lib/utils"
import {
  getStoredIconColor,
  isSvgIcon,
  sanitizeStoredSvg,
} from "@/lib/page-icon-utils"

export function hasPageContent(content: unknown): boolean {
  if (content === null || content === undefined) {
    return false
  }

  if (typeof content === "string") {
    return content.trim().length > 0
  }

  if (Array.isArray(content)) {
    return content.some(hasPageContent)
  }

  if (typeof content !== "object") {
    return true
  }

  const node = content as {
    attrs?: unknown
    content?: unknown
    text?: unknown
    type?: unknown
  }

  if (typeof node.text === "string" && node.text.trim().length > 0) {
    return true
  }

  if (
    typeof node.type === "string" &&
    !["doc", "paragraph", "text"].includes(node.type)
  ) {
    return true
  }

  return hasPageContent(node.content)
}

const iconSizeClasses = {
  sm: "size-4 text-base [&_svg]:size-4",
  md: "size-5 text-lg [&_svg]:size-5",
  lg: "size-9 text-2xl [&_svg]:size-9",
  xl: "size-11 text-3xl [&_svg]:size-11",
} as const

const svgIconSizeClasses = {
  sm: "size-4 rounded-sm [&_svg]:size-2.5",
  md: "size-5 rounded-md [&_svg]:size-3",
  lg: "size-7 rounded-md [&_svg]:size-4",
  xl: "size-8 rounded-md [&_svg]:size-5",
} as const

export function PageIconDisplay({
  className,
  size = "md",
  value,
}: {
  className?: string
  size?: keyof typeof iconSizeClasses
  value: string | null | undefined
}) {
  if (!value) {
    return null
  }

  if (isSvgIcon(value)) {
    const sanitized = sanitizeStoredSvg(value)

    if (!sanitized) {
      return null
    }

    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center leading-none shadow-sm/5",
          svgIconSizeClasses[size],
          getIconSolidClassName(getStoredIconColor(sanitized)),
          className,
        )}
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
    )
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center leading-none",
        iconSizeClasses[size],
        className,
      )}
    >
      {value}
    </span>
  )
}

export function getStoredIconValue(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null
  }

  if (isSvgIcon(value)) {
    return sanitizeStoredSvg(value) ? value : null
  }

  return value
}

export function getPageIconNode(
  page: Pick<Page, "content" | "metadata">,
) {
  const icon = getPageEmoji(page)

  if (icon) {
    return <PageIconDisplay size="sm" value={icon} />
  }

  return hasPageContent(page.content) ? (
    <FileTextIcon className="size-4 text-muted-foreground" />
  ) : (
    <FileIcon className="size-4 text-muted-foreground" />
  )
}

export function getDatabaseIconNode(database: { config?: unknown }) {
  const icon = getDatabaseEmoji(database)

  if (icon) {
    return <PageIconDisplay size="sm" value={icon} />
  }

  return null
}

export function getPageIcon(
  page: Pick<Page, "content" | "metadata">,
) {
  return getPageIconNode(page)
}

export function PageIcon({
  page,
}: {
  page: Pick<Page, "content" | "metadata">
}) {
  return getPageIconNode(page)
}

export function formatPageBreadcrumbLabel(
  page: Pick<Page, "metadata" | "name">,
) {
  const label = page.name.trim() || "Untitled"
  const icon = getPageEmoji(page)

  if (!icon || isSvgIcon(icon)) {
    return label
  }

  return `${icon} ${label}`
}
