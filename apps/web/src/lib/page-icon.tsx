import {
  getPageEmoji,
  type Page,
} from "@zilobase/features/pages"
import { getDatabaseEmoji } from "@zilobase/features/databases"
import { getIconTextClassName } from "@/lib/color-tokens"
import { DEFAULT_PAGE_ITEM_ICON } from "@/lib/item-icons"
import { cn } from "@/lib/utils"
import {
  getDatabaseIconConfig,
  getStoredIconColor,
  isSvgIcon,
  normalizeStoredIconPresentation,
  sanitizeStoredSvg,
} from "@/lib/page-icon-utils"

const iconSizeClasses = {
  sm: "size-4 text-base [&_svg]:size-4",
  md: "size-5 text-lg [&_svg]:size-5",
  lg: "size-9 text-2xl [&_svg]:size-9",
  xl: "size-11 text-3xl [&_svg]:size-11",
  "2xl": "size-20 text-6xl [&_svg]:size-20",
} as const

const svgIconSizeClasses = {
  sm: "size-4 [&_svg]:size-4",
  md: "size-5 [&_svg]:size-5",
  lg: "size-7 [&_svg]:size-7",
  xl: "size-9 [&_svg]:size-9",
  "2xl": "size-16 [&_svg]:size-16",
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
    const sanitized = normalizeStoredIconPresentation(sanitizeStoredSvg(value))

    if (!sanitized) {
      return null
    }

    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center leading-none",
          svgIconSizeClasses[size],
          getIconTextClassName(getStoredIconColor(sanitized)),
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

export function getPageIconNode(
  page: Pick<Page, "content" | "hasContent" | "metadata">,
) {
  const icon = getPageEmoji(page)
  return (
    <PageIconDisplay
      size="sm"
      value={icon ?? DEFAULT_PAGE_ITEM_ICON}
    />
  )
}

function getDatabaseIconValue(database: {
  config?: unknown
  dataSourceConfig?: unknown
}) {
  return getDatabaseEmoji({ config: getDatabaseIconConfig(database) })
}

export function getDatabaseIconNode(database: {
  config?: unknown
  dataSourceConfig?: unknown
}) {
  const icon = getDatabaseIconValue(database)

  if (icon) {
    return <PageIconDisplay size="sm" value={icon} />
  }

  return null
}

export function PageIcon({
  page,
}: {
  page: Pick<Page, "content" | "hasContent" | "metadata">
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
