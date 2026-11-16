import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useTheme } from "next-themes";

import { getDatabaseId, getMeetingId, getPageId } from "@/app/routing/route-identifiers";
import {
  createFaviconHref,
  DEFAULT_DOCUMENT_TITLE,
  getFaviconColor,
  getRouteDocumentTitle,
  getRouteFaviconIcon,
} from "@/app/shell/lib/favicon";
import {
  DEFAULT_DATABASE_ITEM_ICON,
  DEFAULT_MEETING_ITEM_ICON,
} from "@/components/navigation/lib/navigation-icons";
import { useDatabaseMetadata } from "@zilobase/features/databases/react";
import { getDatabaseEmoji } from "@zilobase/features/databases";
import { useMeeting } from "@zilobase/features/meetings/react";
import { getPageEmoji } from "@zilobase/features/pages";
import { usePage } from "@zilobase/features/pages/react";
import {
  getDefaultPageIconValue,
  getPageIconValue,
} from "@/sections/pages/appearance/components/page-icon";
import { useStoredIcon } from "@/hooks/use-stored-icon";

export function DocumentFavicon() {
  const location = useRouterState({ select: (state) => state.location });
  const { resolvedTheme } = useTheme();
  const directPageId = getPageId(location.pathname);
  const databaseId = getDatabaseId(location.pathname);
  const meetingId = getMeetingId(location.pathname);
  const { data: databasePayload } = useDatabaseMetadata(databaseId, {
    includeDeleted: true,
  });
  const { data: meetingPayload } = useMeeting(meetingId);
  const pageId =
    directPageId ?? meetingPayload?.meeting.notesPageId ?? meetingPayload?.meeting.pageId ?? null;
  const { data: page } = usePage(pageId, { refetchOnMount: false });
  const itemIcon = databaseId
    ? databasePayload?.activeDataSource
      ? (getDatabaseEmoji(databasePayload.activeDataSource) ?? DEFAULT_DATABASE_ITEM_ICON)
      : DEFAULT_DATABASE_ITEM_ICON
    : meetingId
      ? ((page ? getPageEmoji(page) : null) ?? DEFAULT_MEETING_ITEM_ICON)
      : directPageId
        ? getPageIconValue(page)
        : null;
  const itemTitle = databaseId
    ? databasePayload?.displayName
    : meetingId
      ? meetingPayload?.meeting.title
      : directPageId
        ? page?.name
        : null;
  const { icon: resolvedItemIcon } = useStoredIcon(
    itemIcon,
    databaseId
      ? DEFAULT_DATABASE_ITEM_ICON
      : meetingId
        ? DEFAULT_MEETING_ITEM_ICON
        : getDefaultPageIconValue(page),
  );
  const icon = getRouteFaviconIcon({
    itemIcon: resolvedItemIcon,
    pathname: location.pathname,
  });
  const title = getRouteDocumentTitle({
    itemTitle,
    pathname: location.pathname,
  });

  useEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    const links = getManagedFaviconLinks();

    if (!icon) {
      restoreDefaultFavicons(links);
      return;
    }

    const color = getFaviconColor(icon, resolveCssColorToken);
    const href = createFaviconHref(icon, { color });

    if (!href) {
      restoreDefaultFavicons(links);
      return;
    }

    for (const link of links) {
      link.href = href;
      link.type = "image/svg+xml";
      link.removeAttribute("media");
    }
  }, [icon, resolvedTheme]);

  useEffect(
    () => () => {
      restoreDefaultFavicons(getManagedFaviconLinks());
      document.title = DEFAULT_DOCUMENT_TITLE;
    },
    [],
  );

  return null;
}

function resolveCssColorToken(name: string) {
  const probe = document.createElement("span");
  probe.style.color = `var(${name})`;
  probe.style.display = "none";
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

type ManagedFaviconLink = HTMLLinkElement & {
  dataset: DOMStringMap & {
    defaultHref?: string;
    defaultMedia?: string;
  };
};

function getManagedFaviconLinks() {
  return Array.from(document.querySelectorAll<ManagedFaviconLink>("link[data-app-favicon]"));
}

function restoreDefaultFavicons(links: ManagedFaviconLink[]) {
  for (const link of links) {
    if (link.dataset.defaultHref) link.href = link.dataset.defaultHref;

    if (link.dataset.defaultMedia) {
      link.media = link.dataset.defaultMedia;
    } else {
      link.removeAttribute("media");
    }
  }
}
