import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckIcon,
  ChevronDown,
  ChevronUp,
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
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { useActiveWorkspaceId } from "@notelab/features/integrations";
import { useDatabase } from "@notelab/features/databases";
import {
  defaultUserSettings,
  useUpdateUserSettings,
  useUserSettings,
} from "@notelab/features/user-settings";
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
} from "@notelab/features/pages";
import { useOptionalPageSidePane } from "@/contexts/page-side-pane";
import {
  isPublishedFallbackPage,
  readPublishedEmbeddedItemsOpenAs,
  writePublishedEmbeddedItemsOpenAs,
} from "@/lib/published-page-preferences";

export function PagePaneHeader({
  bordered = true,
  className,
  leadingControl,
  onClose,
  onOpenDiscussions,
  onTogglePageSidebar,
  pageSidebarOpen,
  pathname,
  rowNavigationDatabaseId,
  showPaneControls = Boolean(onClose),
  showActions = true,
}: {
  bordered?: boolean;
  className?: string;
  leadingControl?: ReactNode | null;
  onClose?: () => void;
  onOpenDiscussions?: () => void;
  onTogglePageSidebar?: () => void;
  pageSidebarOpen?: boolean;
  pathname: string;
  rowNavigationDatabaseId?: string | null;
  showPaneControls?: boolean;
  showActions?: boolean;
}) {
  const pageId = getPageId(pathname);
  const databaseId = getDatabaseId(pathname);
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
        {leadingControls ? (
          <>
            {leadingControls}
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
          </>
        ) : null}
        <AppBreadcrumbs pathname={pathname} />
      </div>
      {showActions ? (
        <div className="ml-auto px-3">
          <NavActions
            databaseId={databaseId}
            onOpenDiscussions={onOpenDiscussions}
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
          <ArrowRight />
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

  if (pageId) {
    return <PageBreadcrumb pageId={pageId} />;
  }

  if (databaseId) {
    return <DatabaseBreadcrumb databaseId={databaseId} />;
  }

  if (pathname.startsWith("/settings")) {
    const settingsPageTitle = getSettingsPageTitle(pathname);

    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="hidden sm:inline-flex">
            <BreadcrumbLink asChild>
              <Link to="/settings">Settings</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {settingsPageTitle ? (
            <>
              <BreadcrumbSeparator className="hidden sm:inline-flex" />
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

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbPage className="line-clamp-1">Dashboard</BreadcrumbPage>
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

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        <BreadcrumbItem className="hidden sm:inline-flex">
          <BreadcrumbLink asChild>
            <Link to="/dashboard">Dashboard</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator className="hidden sm:inline-flex" />
        {breadcrumbs.length > 0 ? (
          breadcrumbs.map((item, index) => {
            const isCurrent = index === breadcrumbs.length - 1;
            const label = getPageBreadcrumbLabel(item);

            return (
              <BreadcrumbFragment
                isCurrent={isCurrent}
                item={item}
                key={item.id}
                label={label}
              />
            );
          })
        ) : (
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="block max-w-64 truncate sm:max-w-80 md:max-w-96 lg:max-w-[42rem]">
              Page
            </BreadcrumbPage>
          </BreadcrumbItem>
        )}
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

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        <BreadcrumbItem className="hidden sm:inline-flex">
          <BreadcrumbLink asChild>
            <Link to="/dashboard">Dashboard</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator className="hidden sm:inline-flex" />
        {breadcrumbs.map((item) => (
          <BreadcrumbFragment
            isCurrent={false}
            item={item}
            key={item.id}
            label={getPageBreadcrumbLabel(item)}
          />
        ))}
        <BreadcrumbItem className="min-w-0">
          <BreadcrumbPage className="block max-w-64 truncate sm:max-w-80 md:max-w-96 lg:max-w-[42rem]">
            {payload?.database.name.trim() || "Database"}
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function BreadcrumbFragment({
  isCurrent,
  item,
  label,
}: {
  isCurrent: boolean;
  item: Page;
  label: string;
}) {
  return (
    <>
      <BreadcrumbItem className="min-w-0">
        {isCurrent ? (
          <BreadcrumbPage className="block max-w-64 truncate sm:max-w-80 md:max-w-96 lg:max-w-[42rem]">
            {label}
          </BreadcrumbPage>
        ) : (
          <BreadcrumbLink
            asChild
            className="block max-w-32 truncate sm:max-w-48"
          >
            <Link to="/p/$pageId" params={{ pageId: item.id }}>
              {label}
            </Link>
          </BreadcrumbLink>
        )}
      </BreadcrumbItem>
      {!isCurrent ? <BreadcrumbSeparator /> : null}
    </>
  );
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
    integrations: "Integrations",
    "notelab-ai": "Notelab AI",
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
