import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  CheckIcon,
  ChevronDown,
  ChevronUp,
  ChevronsRight,
  Maximize2,
  PanelRightIcon,
  SquareIcon,
} from "lucide-react";
import { toast } from "sonner";

import { NavActions } from "@/components/nav-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { useActiveWorkspaceId } from "@zilobase/features/integrations";
import { useDatabase } from "@zilobase/features/databases";
import { useMeeting } from "@zilobase/features/meetings";
import {
  defaultUserSettings,
  useUpdateUserSettings,
  useUserSettings,
} from "@zilobase/features/user-settings";
import { formatPageBreadcrumbLabel } from "@/lib/page-icon";
import {
  embeddedItemsOpenAsLabels,
  embeddedItemsOpenAsModes,
  getPrimaryPageParentId,
  resolveEmbeddedItemsOpenAs,
  usePage,
  usePageNavigation,
  type EmbeddedItemsOpenAs,
  type Page,
  type PageItemPlacement,
} from "@zilobase/features/pages";
import { useOptionalPageSidePane } from "@/contexts/page-side-pane";
import {
  isPublishedFallbackPage,
  readPublishedEmbeddedItemsOpenAs,
  writePublishedEmbeddedItemsOpenAs,
} from "@/lib/published-page-preferences";

export function useRoutePageId(pathname: string) {
  const routePageId = getPageId(pathname)
  const meetingId = getMeetingId(pathname)
  const { data } = useMeeting(meetingId)
  return routePageId ?? data?.meeting.notesPageId ?? null
}

export function PagePaneHeader({
  bordered = true,
  className,
  discussionsOpen = false,
  leadingControl,
  onClose,
  onToggleDiscussions,
  onTogglePageSidebar,
  pageSidebarOpen,
  pathname,
  rowNavigationDatabaseId,
  showPaneControls = Boolean(onClose),
  showActions = true,
}: {
  bordered?: boolean;
  className?: string;
  discussionsOpen?: boolean;
  leadingControl?: ReactNode | null;
  onClose?: () => void;
  onToggleDiscussions?: () => void;
  onTogglePageSidebar?: () => void;
  pageSidebarOpen?: boolean;
  pathname: string;
  rowNavigationDatabaseId?: string | null;
  showPaneControls?: boolean;
  showActions?: boolean;
}) {
  const pageId = useRoutePageId(pathname);
  const databaseId = getDatabaseId(pathname);
  const meetingId = getMeetingId(pathname);
  const leadingControls = showPaneControls ? (
    <PagePaneControls
      leadingControl={leadingControl}
      onClose={onClose}
      pageId={pageId}
      pathname={pathname}
      rowNavigationDatabaseId={rowNavigationDatabaseId}
    />
  ) : (
    leadingControl
  );

  return (
    <header
      className={`flex h-12 shrink-0 items-center gap-2 ${bordered ? "border-b" : ""} ${className ?? ""}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
        {leadingControls}
        <AppBreadcrumbs pathname={pathname} />
      </div>
      {showActions ? (
        <div className="ml-auto px-3">
          <NavActions
            databaseId={databaseId}
            meetingId={meetingId}
            discussionsOpen={discussionsOpen}
            onToggleDiscussions={onToggleDiscussions}
            onTogglePageSidebar={onTogglePageSidebar}
            pageSidebarOpen={pageSidebarOpen}
            pageId={pageId}
          />
        </div>
      ) : null}
    </header>
  );
}

function PagePaneControls({
  leadingControl,
  onClose,
  pageId,
  pathname,
  rowNavigationDatabaseId,
}: {
  leadingControl?: ReactNode | null;
  onClose?: () => void;
  pageId: string | null;
  pathname: string;
  rowNavigationDatabaseId?: string | null;
}) {
  const sidePane = useOptionalPageSidePane();
  const { data: page } = usePage(pageId, { refetchOnMount: false });
  const { data: userSettings = defaultUserSettings } = useUserSettings();
  const updateUserSettings = useUpdateUserSettings();
  const isPublishedFallback = isPublishedFallbackPage(page);
  const [publishedEmbeddedItemsOpenAs, setPublishedEmbeddedItemsOpenAs] =
    useState<EmbeddedItemsOpenAs>(readPublishedEmbeddedItemsOpenAs);
  const mode = isPublishedFallback
    ? publishedEmbeddedItemsOpenAs
    : resolveEmbeddedItemsOpenAs(page, userSettings.embeddedItemsOpenAs);
  const rowDatabaseId = pageId ? rowNavigationDatabaseId : null;
  const isDialogPane = !onClose;
  const { data: rowDatabasePayload } = useDatabase(rowDatabaseId);
  const { nextRowPageId, previousRowPageId } = useMemo(() => {
    const rowPageIds =
      rowDatabasePayload?.rows
        .filter((row) => !row.deletedAt)
        .slice()
        .sort((first, second) => first.position - second.position)
        .map((row) => row.pageId) ?? [];
    const currentRowIndex = pageId ? rowPageIds.indexOf(pageId) : -1;

    return {
      previousRowPageId:
        currentRowIndex > 0 ? rowPageIds[currentRowIndex - 1] : null,
      nextRowPageId:
        currentRowIndex >= 0 && currentRowIndex < rowPageIds.length - 1
          ? rowPageIds[currentRowIndex + 1]
          : null,
    };
  }, [pageId, rowDatabasePayload?.rows]);

  const handleModeSelect = (nextMode: EmbeddedItemsOpenAs) => {
    if (!pageId) {
      return;
    }

    if (isPublishedFallback) {
      writePublishedEmbeddedItemsOpenAs(nextMode);
      setPublishedEmbeddedItemsOpenAs(nextMode);
    } else {
      updateUserSettings.mutate(
        { embeddedItemsOpenAs: nextMode },
        {
          onError: (error) => {
            toast.error(
              error instanceof Error
                ? error.message
                : "Could not update open pages setting.",
            );
          },
        },
      );
    }

    if (nextMode === "dialog" && !isDialogPane) {
      sidePane?.openEmbeddedPageDialog(pageId, {
        databaseId: rowDatabaseId,
      });
    } else if (nextMode === "sidepanel" && isDialogPane) {
      sidePane?.openSidePane(pageId, { databaseId: rowDatabaseId });
    }
  };

  const openRowPage = (targetPageId: string | null) => {
    if (!targetPageId || !rowDatabaseId) {
      return;
    }

    if (isDialogPane) {
      sidePane?.openEmbeddedPageDialog(targetPageId, {
        databaseId: rowDatabaseId,
      });
    } else {
      sidePane?.openSidePane(targetPageId, { databaseId: rowDatabaseId });
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-1">
      {onClose ? (
        <Button
          aria-label="Close"
          onClick={onClose}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <ChevronsRight />
        </Button>
      ) : (
        leadingControl
      )}
      <Button
        aria-label="Open as full page"
        asChild
        size="icon-sm"
        variant="ghost"
      >
        <Link to={pathname}>
          <Maximize2 />
        </Link>
      </Button>
      {pageId ? (
        <OpenPageAsDropdown
          disabled={!isPublishedFallback && updateUserSettings.isPending}
          mode={mode}
          onSelect={handleModeSelect}
        />
      ) : null}
      {rowDatabaseId ? (
        <>
          <Separator
            orientation="vertical"
            className="mx-1 data-[orientation=vertical]:h-4"
          />
          <Button
            aria-label="Open previous row"
            disabled={!previousRowPageId}
            onClick={() => openRowPage(previousRowPageId)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <ChevronUp />
          </Button>
          <Button
            aria-label="Open next row"
            disabled={!nextRowPageId}
            onClick={() => openRowPage(nextRowPageId)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <ChevronDown />
          </Button>
        </>
      ) : null}
    </div>
  );
}

function OpenPageAsDropdown({
  disabled,
  mode,
  onSelect,
}: {
  disabled?: boolean;
  mode: EmbeddedItemsOpenAs;
  onSelect: (mode: EmbeddedItemsOpenAs) => void;
}) {
  const ModeIcon = mode === "sidepanel" ? PanelRightIcon : SquareIcon;
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Open pages as"
          disabled={disabled}
          size="icon-sm"
          title={`Open pages as ${embeddedItemsOpenAsLabels[mode]}`}
          type="button"
          variant="ghost"
        >
          <ModeIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-52"
      >
        {embeddedItemsOpenAsModes.map((value) => {
          const OptionIcon = value === "sidepanel" ? PanelRightIcon : SquareIcon;

          return (
            <DropdownMenuItem
              key={value}
              onSelect={(event) => {
                event.preventDefault();
                onSelect(value);
                setOpen(false);
              }}
            >
              <OptionIcon />
              <span>{embeddedItemsOpenAsLabels[value]}</span>
              {mode === value ? <CheckIcon className="ml-auto" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppBreadcrumbs({ pathname }: { pathname: string }) {
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
            <BreadcrumbLink render={<Link to="/settings" />}>
              Settings
            </BreadcrumbLink>
          </BreadcrumbItem>
          {settingsPageTitle ? (
            <>
              <BreadcrumbSlash className="hidden sm:inline-flex" />
              <BreadcrumbItem>
                <BreadcrumbPage className="line-clamp-1">
                  {settingsPageTitle}
                </BreadcrumbPage>
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

  if (pathname === "/recents") {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/recents" />}>
              Library
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSlash />
          <BreadcrumbItem>
            <BreadcrumbPage className="line-clamp-1">Recents</BreadcrumbPage>
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
  const pages = navigation?.pages ?? [];
  const page = pages.find((item) => item.id === pageId);
  const breadcrumbs = page
    ? buildPageBreadcrumbs(page, pages, navigation?.placements ?? [])
    : [];
  const entries: AppBreadcrumbEntry[] = [
    getLibrarySectionBreadcrumbEntry(breadcrumbs[0] ?? page),
    ...(breadcrumbs.length > 0
      ? breadcrumbs.map((item, index) => ({
          current: index === breadcrumbs.length - 1,
          id: item.id,
          label: getPageBreadcrumbLabel(item),
          target:
            index === breadcrumbs.length - 1
              ? undefined
              : ({ pageId: item.id, type: "page" } as const),
        }))
      : [{ current: true, id: "page", label: "Page" }]),
  ];

  return <CollapsedBreadcrumbTrail entries={entries} />;
}

function MeetingBreadcrumb({ meetingId }: { meetingId: string }) {
  const { data } = useMeeting(meetingId);

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        <BreadcrumbItem className="hidden sm:inline-flex">
          <BreadcrumbPage>Meetings</BreadcrumbPage>
        </BreadcrumbItem>
        <BreadcrumbSlash className="hidden sm:inline-flex" />
        <BreadcrumbItem className="min-w-0">
          <BreadcrumbPage className="block max-w-64 truncate sm:max-w-80 md:max-w-96 lg:max-w-[42rem]">
            {data?.meeting.title.trim() || "Meeting"}
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function DatabaseBreadcrumb({ databaseId }: { databaseId: string }) {
  const workspaceId = useActiveWorkspaceId();
  const { data: payload } = useDatabase(databaseId, {
    includeDeleted: true,
  });
  const databasePageId = payload?.database.pageId;
  const { data: navigation } = usePageNavigation(workspaceId);
  const pages = navigation?.pages ?? [];
  const page = databasePageId
    ? pages.find((item) => item.id === databasePageId)
    : undefined;
  const breadcrumbs = page
    ? buildPageBreadcrumbs(page, pages, navigation?.placements ?? [])
    : [];
  const entries: AppBreadcrumbEntry[] = [
    getLibrarySectionBreadcrumbEntry(breadcrumbs[0] ?? page),
    ...breadcrumbs.map((item) => ({
      id: item.id,
      label: getPageBreadcrumbLabel(item),
      target: { pageId: item.id, type: "page" } as const,
    })),
    {
      current: true,
      id: `database-${databaseId}`,
      label: payload?.database.name.trim() || "Database",
    },
  ];

  return <CollapsedBreadcrumbTrail entries={entries} />;
}

type AppBreadcrumbTarget =
  | { type: "library"; view: "private" | "shared" }
  | { type: "recents" }
  | { pageId: string; type: "page" };

type AppBreadcrumbEntry = {
  current?: boolean;
  id: string;
  label: string;
  target?: AppBreadcrumbTarget;
};

function getLibrarySectionBreadcrumbEntry(
  rootPage: Page | undefined,
): AppBreadcrumbEntry {
  if (!rootPage) {
    return {
      id: "library",
      label: "Library",
      target: { type: "recents" },
    };
  }

  const view = rootPage.isShared ? "shared" : "private";

  return {
    id: `library-${view}`,
    label: view === "shared" ? "Shared" : "Private",
    target: { type: "library", view },
  };
}

function CollapsedBreadcrumbTrail({
  entries,
}: {
  entries: AppBreadcrumbEntry[];
}) {
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
                    className="-m-1.5 text-muted-foreground"
                    size="icon-sm"
                    variant="ghost"
                  >
                    <BreadcrumbEllipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {collapsedEntries.map((entry) => (
                    <CollapsedBreadcrumbMenuItem
                      entry={entry}
                      key={entry.id}
                    />
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
          {entry.label}
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
        render={
          <Link
            params={{ pageId: entry.target.pageId }}
            to="/p/$pageId"
          />
        }
      >
        {entry.label}
      </BreadcrumbLink>
    );
  }

  if (entry.target?.type === "library") {
    return (
      <BreadcrumbLink
        className="block max-w-32 truncate sm:max-w-48"
        render={
          <Link
            search={{ view: entry.target.view } as never}
            to="/recents"
          />
        }
      >
        {entry.label}
      </BreadcrumbLink>
    );
  }

  return (
    <BreadcrumbLink
      className="block max-w-32 truncate sm:max-w-48"
      render={<Link to="/recents" />}
    >
      {entry.label}
    </BreadcrumbLink>
  );
}

function CollapsedBreadcrumbMenuItem({
  entry,
}: {
  entry: AppBreadcrumbEntry;
}) {
  if (entry.target?.type === "page") {
    return (
      <DropdownMenuItem asChild>
        <Link params={{ pageId: entry.target.pageId }} to="/p/$pageId">
          {entry.label}
        </Link>
      </DropdownMenuItem>
    );
  }

  if (entry.target?.type === "library") {
    return (
      <DropdownMenuItem asChild>
        <Link
          search={{ view: entry.target.view } as never}
          to="/recents"
        >
          {entry.label}
        </Link>
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuItem asChild>
      <Link to="/recents">{entry.label}</Link>
    </DropdownMenuItem>
  );
}

function BreadcrumbSlash({ className }: { className?: string }) {
  return <BreadcrumbSeparator className={className}>/</BreadcrumbSeparator>;
}

function buildPageBreadcrumbs(
  page: Page,
  pages: Page[],
  placements: PageItemPlacement[],
) {
  const pagesById = new Map([...pages, page].map((item) => [item.id, item]));
  const breadcrumbs: Page[] = [];
  const visited = new Set<string>();
  let current: Page | undefined = page;

  while (current && !visited.has(current.id)) {
    breadcrumbs.unshift(current);
    visited.add(current.id);

    const parentItemId = getPrimaryPageParentId(placements, current.id);

    current = parentItemId ? pagesById.get(parentItemId) : undefined;
  }

  return breadcrumbs;
}

function getPageBreadcrumbLabel(page: Page) {
  return formatPageBreadcrumbLabel(page);
}

function getSettingsPageTitle(pathname: string) {
  const pathParts = pathname.split("/").filter(Boolean);
  const page = pathParts[1];

  if (!page) {
    return null;
  }

  const titles: Record<string, string> = {
    preferences: "Preferences",
    integrations: "Integrations",
    "zilobase-ai": "Zilobase AI",
    workspace: "Workspace",
    profile: "Profile",
    team: "Team",
  };

  return titles[page] ?? null;
}

export function getPageId(pathname: string) {
  const match = pathname.match(/^\/p\/([^/]+)/);

  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function getDatabaseId(pathname: string) {
  const match = pathname.match(/^\/d\/([^/]+)/);

  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function getMeetingId(pathname: string) {
  const match = pathname.match(/^\/m\/([^/]+)/);

  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
