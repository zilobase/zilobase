import { useEffect } from "react"
import { useRouterState } from "@tanstack/react-router"
import { useTheme } from "next-themes"

import {
  getDatabaseId,
  getMeetingId,
  getPageId,
} from "@/components/page-pane-header"
import {
  createFaviconHref,
  DEFAULT_DOCUMENT_TITLE,
  getFaviconColor,
  getRouteDocumentTitle,
  getRouteFaviconIcon,
} from "@/lib/favicon"
import {
  DEFAULT_DATABASE_ITEM_ICON,
  DEFAULT_MEETING_ITEM_ICON,
  DEFAULT_PAGE_ITEM_ICON,
} from "@/lib/item-icons"
import { getDatabaseEmoji, useDatabase } from "@zilobase/features/databases"
import { useMeeting } from "@zilobase/features/meetings"
import { getPageEmoji, usePage } from "@zilobase/features/pages"

export function DocumentFavicon() {
  const location = useRouterState({ select: (state) => state.location })
  const { resolvedTheme } = useTheme()
  const directPageId = getPageId(location.pathname)
  const databaseId = getDatabaseId(location.pathname)
  const meetingId = getMeetingId(location.pathname)
  const { data: databasePayload } = useDatabase(databaseId, {
    includeDeleted: true,
  })
  const { data: meetingPayload } = useMeeting(meetingId)
  const pageId =
    directPageId ??
    meetingPayload?.meeting.notesPageId ??
    meetingPayload?.meeting.pageId ??
    null
  const { data: page } = usePage(pageId, { refetchOnMount: false })
  const itemIcon = databaseId
    ? databasePayload?.database
      ? getDatabaseEmoji(databasePayload.database) ?? DEFAULT_DATABASE_ITEM_ICON
      : DEFAULT_DATABASE_ITEM_ICON
    : meetingId
      ? (page ? getPageEmoji(page) : null) ?? DEFAULT_MEETING_ITEM_ICON
      : directPageId
        ? (page ? getPageEmoji(page) : null) ?? DEFAULT_PAGE_ITEM_ICON
        : null
  const itemTitle = databaseId
    ? databasePayload?.database.name
    : meetingId
      ? meetingPayload?.meeting.title
      : directPageId
        ? page?.name
        : null
  const icon = getRouteFaviconIcon({
    itemIcon,
    pathname: location.pathname,
  })
  const title = getRouteDocumentTitle({
    itemTitle,
    pathname: location.pathname,
  })

  useEffect(() => {
    document.title = title
  }, [title])

  useEffect(() => {
    const links = getManagedFaviconLinks()

    if (!icon) {
      restoreDefaultFavicons(links)
      return
    }

    const color = getFaviconColor(
      icon,
      resolveCssColorToken,
    )
    const href = createFaviconHref(icon, { color })

    if (!href) {
      restoreDefaultFavicons(links)
      return
    }

    for (const link of links) {
      link.href = href
      link.type = "image/svg+xml"
      link.removeAttribute("media")
    }
  }, [icon, resolvedTheme])

  useEffect(
    () => () => {
      restoreDefaultFavicons(getManagedFaviconLinks())
      document.title = DEFAULT_DOCUMENT_TITLE
    },
    [],
  )

  return null
}

function resolveCssColorToken(name: string) {
  const probe = document.createElement("span")
  probe.style.color = `var(${name})`
  probe.style.display = "none"
  document.body.append(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return color
}

type ManagedFaviconLink = HTMLLinkElement & {
  dataset: DOMStringMap & {
    defaultHref?: string
    defaultMedia?: string
  }
}

function getManagedFaviconLinks() {
  return Array.from(
    document.querySelectorAll<ManagedFaviconLink>("link[data-app-favicon]"),
  )
}

function restoreDefaultFavicons(links: ManagedFaviconLink[]) {
  for (const link of links) {
    if (link.dataset.defaultHref) link.href = link.dataset.defaultHref

    if (link.dataset.defaultMedia) {
      link.media = link.dataset.defaultMedia
    } else {
      link.removeAttribute("media")
    }
  }
}
