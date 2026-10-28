import { ContentVerificationValue } from "@/sections/pages/header/components/content-verification";
import { CalendarIcon, Layers3Icon, LockIcon, UsersIcon } from "@/components/icons";
import { Link, useLocation } from "@tanstack/react-router";
import { useCallback, useSyncExternalStore, type ReactNode } from "react";

import {
  getPageConnectionIndicator,
  subscribePageConnectionIndicator,
} from "@/sections/pages/editor/collaboration/lib/page-document-session";
import { libraryViewIcons } from "@/components/navigation/lib/library-views";
import { libraryViewLabels } from "@/components/navigation/lib/library-views";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDatabaseBootstrap } from "@zilobase/features/databases/react";
import { useMeeting } from "@zilobase/features/meetings/react";
import {
  buildCanonicalBreadcrumbTrail,
  getBreadcrumbNavigationSection,
  type BreadcrumbNavigationItem,
} from "@zilobase/features/pages";
import { usePageNavigation } from "@zilobase/features/pages/react";
import { useTeamspaces } from "@zilobase/features/teamspaces/react";
import { libraryViewIds, type LibraryView } from "@zilobase/features/user-settings";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";
import {
  DEFAULT_DATABASE_ITEM_ICON,
  DEFAULT_MEETING_ITEM_ICON,
} from "@/components/navigation/lib/navigation-icons";
import { getDatabaseId, getMeetingId, getPageId } from "@/app/routing/route-identifiers";
import {
  getDatabaseIconNode,
  getPageIconNode,
  PageIconDisplay,
} from "@/sections/pages/appearance/components/page-icon";

export function AppBreadcrumbs({ pathname }: { pathname: string }) {
  const location = useLocation();
  const pageId = getPageId(pathname);
  const databaseId = getDatabaseId(pathname);
  const meetingId = getMeetingId(pathname);

  if (pageId) {
    return <PageBreadcrumb pageId={pageId} />;
  }

  if (databaseId) {
    return <DatabaseBreadcrumb databaseId={databaseId} />;
  }

  if (meetingId) {
    return <MeetingBreadcrumb meetingId={meetingId} />;
  }

  if (pathname.startsWith("/settings")) {
    const settingsPageTitle = getSettingsPageTitle(pathname);

    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="hidden sm:inline-flex">
            <BreadcrumbLink render={<Link to="/settings" />}>Settings</BreadcrumbLink>
          </BreadcrumbItem>
          {settingsPageTitle ? (
            <>
              <BreadcrumbSlash className="hidden sm:inline-flex" />
              <BreadcrumbItem>
                <BreadcrumbPage className="line-clamp-1">{settingsPageTitle}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : null}
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  if (pathname === "/canvas") {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage className="line-clamp-1">Canvas</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  if (pathname === "/calendar") {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage className="flex items-center gap-1.5">
              <CalendarIcon className="size-4" />
              Calendar
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  if (pathname === "/ai") {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage className="line-clamp-1">Ask AI</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  if (pathname === "/recents") {
    const requestedView = location.search.view;
    const libraryView = libraryViewIds.includes(requestedView as LibraryView)
      ? (requestedView as LibraryView)
      : "recents";
    const LibraryViewIcon = libraryViewIcons[libraryView];

    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/recents" />}>Library</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSlash />
          <BreadcrumbItem>
            <BreadcrumbPage className="gap-1.5">
              <LibraryViewIcon aria-hidden="true" className="size-4 shrink-0" />
              <span className="line-clamp-1">{libraryViewLabels[libraryView]}</span>
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbPage className="line-clamp-1">Recents</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function PageBreadcrumb({ pageId }: { pageId: string }) {
  const workspaceId = useActiveWorkspaceId();
  const { data: navigation } = usePageNavigation(workspaceId);
  const { data: teamspaces = [] } = useTeamspaces(workspaceId);
  const trail = navigation
    ? buildCanonicalBreadcrumbTrail(
        { id: pageId, kind: "page" },
        navigation.pages,
        navigation.databases,
        navigation.placements,
      )
    : [];
  const entries = buildBreadcrumbEntries(trail, teamspaces, pageId);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <CollapsedBreadcrumbTrail entries={entries} />
      {workspaceId ? (
        <ContentVerificationValue resource={{ workspaceId, type: "page", id: pageId }} badgeOnly />
      ) : null}
      <PageConnectionDot pageId={pageId} />
    </div>
  );
}

function PageConnectionDot({ pageId }: { pageId: string }) {
  const subscribe = useCallback(
    (listener: () => void) => subscribePageConnectionIndicator(pageId, listener),
    [pageId],
  );
  const getSnapshot = useCallback(() => getPageConnectionIndicator(pageId), [pageId]);
  const indicator = useSyncExternalStore(subscribe, getSnapshot, () => null);
  if (!indicator) return null;

  const label = indicator === "connected" ? "Collaboration connected" : "Connecting collaboration";
  return (
    <span
      aria-label={label}
      className={`size-2 shrink-0 rounded-full ${
        indicator === "connected" ? "bg-feedback-success" : "bg-feedback-warning"
      }`}
      role="status"
      title={label}
    />
  );
}

function MeetingBreadcrumb({ meetingId }: { meetingId: string }) {
  const { data } = useMeeting(meetingId);

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        <BreadcrumbItem className="hidden sm:inline-flex">
          <BreadcrumbPage className="inline-flex items-center gap-1.5">
            <PageIconDisplay size="sm" value={DEFAULT_MEETING_ITEM_ICON} />
            Meetings
          </BreadcrumbPage>
        </BreadcrumbItem>
        <BreadcrumbSlash className="hidden sm:inline-flex" />
        <BreadcrumbItem className="min-w-0">
          <BreadcrumbPage className="block max-w-64 truncate sm:max-w-80 md:max-w-96 lg:max-w-[42rem]">
            <span className="inline-flex items-center gap-1.5">
              <PageIconDisplay size="sm" value={DEFAULT_MEETING_ITEM_ICON} />
              {data?.meeting.title.trim() || "Meeting"}
            </span>
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function DatabaseBreadcrumb({ databaseId }: { databaseId: string }) {
  const workspaceId = useActiveWorkspaceId();
  const { data: payload } = useDatabaseBootstrap({
    databaseId,
    includeDeleted: true,
  });
  const { data: navigation } = usePageNavigation(workspaceId);
  const { data: teamspaces = [] } = useTeamspaces(workspaceId);
  const trail = navigation
    ? buildCanonicalBreadcrumbTrail(
        { id: databaseId, kind: "database" },
        navigation.pages,
        navigation.databases,
        navigation.placements,
      )
    : [];
  const fallbackTrail =
    trail.length === 0 && payload?.database
      ? [
          {
            database: { ...payload.database, views: payload.views },
            id: databaseId,
            kind: "database" as const,
          },
        ]
      : trail;
  const entries = buildBreadcrumbEntries(fallbackTrail, teamspaces, databaseId);

  return <CollapsedBreadcrumbTrail entries={entries} />;
}

type AppBreadcrumbTarget =
  | { type: "library"; view: "private" | "shared" }
  | { type: "recents" }
  | { databaseId: string; type: "database" }
  | { pageId: string; type: "page" };

type AppBreadcrumbEntry = {
  current?: boolean;
  id: string;
  icon?: ReactNode;
  label: string;
  target?: AppBreadcrumbTarget;
};

function CollapsedBreadcrumbTrail({ entries }: { entries: AppBreadcrumbEntry[] }) {
  const shouldCollapse = entries.length > 3;
  const firstEntry = entries[0];
  const collapsedEntries = shouldCollapse ? entries.slice(1, -2) : [];
  const trailingEntries = shouldCollapse ? entries.slice(-2) : entries.slice(1);

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {firstEntry ? <BreadcrumbTrailEntry entry={firstEntry} /> : null}
        {collapsedEntries.length > 0 ? (
          <>
            <BreadcrumbSlash />
            <BreadcrumbItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label="More pages"
                    className="-m-1.5 text-content-secondary"
                    size="icon-sm"
                    variant="ghost"
                  >
                    <BreadcrumbEllipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {collapsedEntries.map((entry) => (
                    <CollapsedBreadcrumbMenuItem entry={entry} key={entry.id} />
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </BreadcrumbItem>
          </>
        ) : null}
        {trailingEntries.map((entry) => (
          <BreadcrumbTrailPart entry={entry} key={entry.id} />
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function BreadcrumbTrailPart({ entry }: { entry: AppBreadcrumbEntry }) {
  return (
    <>
      <BreadcrumbSlash />
      <BreadcrumbTrailEntry entry={entry} />
    </>
  );
}

function BreadcrumbTrailEntry({ entry }: { entry: AppBreadcrumbEntry }) {
  return (
    <BreadcrumbItem className="min-w-0">
      {entry.current || !entry.target ? (
        <BreadcrumbPage className="block max-w-64 truncate sm:max-w-80 md:max-w-96 lg:max-w-[42rem]">
          <BreadcrumbEntryContent entry={entry} />
        </BreadcrumbPage>
      ) : (
        <BreadcrumbEntryLink entry={entry} />
      )}
    </BreadcrumbItem>
  );
}

function BreadcrumbEntryLink({ entry }: { entry: AppBreadcrumbEntry }) {
  if (entry.target?.type === "page") {
    return (
      <BreadcrumbLink
        className="block max-w-32 truncate sm:max-w-48"
        render={<Link params={{ pageId: entry.target.pageId }} to="/p/$pageId" />}
      >
        <BreadcrumbEntryContent entry={entry} />
      </BreadcrumbLink>
    );
  }

  if (entry.target?.type === "library") {
    return (
      <BreadcrumbLink
        className="block max-w-32 truncate sm:max-w-48"
        render={<Link search={{ view: entry.target.view } as never} to="/recents" />}
      >
        <BreadcrumbEntryContent entry={entry} />
      </BreadcrumbLink>
    );
  }

  if (entry.target?.type === "database") {
    return (
      <BreadcrumbLink
        className="flex max-w-32 items-center gap-1.5 truncate sm:max-w-48"
        render={
          <Link
            params={{ databaseId: entry.target.databaseId }}
            search={{ view: undefined }}
            to="/d/$databaseId"
          />
        }
      >
        <BreadcrumbEntryContent entry={entry} />
      </BreadcrumbLink>
    );
  }

  return (
    <BreadcrumbLink className="block max-w-32 truncate sm:max-w-48" render={<Link to="/recents" />}>
      <BreadcrumbEntryContent entry={entry} />
    </BreadcrumbLink>
  );
}

function CollapsedBreadcrumbMenuItem({ entry }: { entry: AppBreadcrumbEntry }) {
  if (entry.target?.type === "page") {
    return (
      <DropdownMenuItem asChild>
        <Link params={{ pageId: entry.target.pageId }} to="/p/$pageId">
          <BreadcrumbEntryContent entry={entry} />
        </Link>
      </DropdownMenuItem>
    );
  }

  if (entry.target?.type === "library") {
    return (
      <DropdownMenuItem asChild>
        <Link search={{ view: entry.target.view } as never} to="/recents">
          <BreadcrumbEntryContent entry={entry} />
        </Link>
      </DropdownMenuItem>
    );
  }

  if (entry.target?.type === "database") {
    return (
      <DropdownMenuItem asChild>
        <Link
          params={{ databaseId: entry.target.databaseId }}
          search={{ view: undefined }}
          to="/d/$databaseId"
        >
          <BreadcrumbEntryContent entry={entry} />
        </Link>
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuItem asChild>
      <Link to="/recents">
        <BreadcrumbEntryContent entry={entry} />
      </Link>
    </DropdownMenuItem>
  );
}

function BreadcrumbSlash({ className }: { className?: string }) {
  return <BreadcrumbSeparator className={className}>/</BreadcrumbSeparator>;
}

function BreadcrumbEntryContent({ entry }: { entry: AppBreadcrumbEntry }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {entry.icon}
      <span className="truncate">{entry.label}</span>
    </span>
  );
}

function buildBreadcrumbEntries(
  trail: BreadcrumbNavigationItem[],
  teamspaces: { id: string; name: string }[],
  currentId: string,
): AppBreadcrumbEntry[] {
  if (trail.length === 0) return [{ current: true, id: currentId, label: "Page" }];
  const section = getBreadcrumbNavigationSection(
    trail,
    new Map(teamspaces.map((teamspace) => [teamspace.id, teamspace.name])),
  );
  const sectionEntry: AppBreadcrumbEntry =
    section.kind === "teamspace"
      ? {
          icon: <Layers3Icon className="size-4" />,
          id: `teamspace-${section.teamspaceId}`,
          label: section.label,
        }
      : {
          icon:
            section.kind === "shared" ? (
              <UsersIcon className="size-4" />
            ) : (
              <LockIcon className="size-4" />
            ),
          id: `library-${section.kind}`,
          label: section.label,
          target: { type: "library", view: section.kind },
        };

  return [
    sectionEntry,
    ...trail.map((item, index): AppBreadcrumbEntry =>
      item.kind === "page"
        ? {
            current: index === trail.length - 1,
            icon: getPageIconNode(item.page),
            id: `page-${item.id}`,
            label: item.page.name.trim() || "Untitled",
            target: index === trail.length - 1 ? undefined : { pageId: item.id, type: "page" },
          }
        : {
            current: index === trail.length - 1,
            icon: getDatabaseIconNode(item.database) ?? (
              <PageIconDisplay size="sm" value={DEFAULT_DATABASE_ITEM_ICON} />
            ),
            id: `database-${item.id}`,
            label: item.database.name.trim() || "Database",
            target:
              index === trail.length - 1 ? undefined : { databaseId: item.id, type: "database" },
          },
    ),
  ];
}

function getSettingsPageTitle(pathname: string) {
  const pathParts = pathname.split("/").filter(Boolean);
  const page = pathParts[1];

  if (!page) {
    return null;
  }

  const titles: Record<string, string> = {
    preferences: "Preferences",
    workspace: "Workspace",
    profile: "Profile",
    team: "Team",
  };

  return titles[page] ?? null;
}
