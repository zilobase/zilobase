import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2Icon, PlusIcon, SearchIcon } from "@/shared/components/icons";
import { toast } from "sonner";

import { Button } from "@/shared/ui/button";
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerTrigger,
} from "@/shared/ui/dropdrawer";
import { Input } from "@/shared/ui/input";

import { getApiErrorMessage } from "@/features/desktop/network/api";
import { PageIcon } from "@/features/pages/index";
import { buildPagePath } from "@/features/pages/index";
import { useZilobaseFeatures } from "@zilobase/features";
import {
  useCreatePage,
  useUpdatePage,
  usePageNavigation,
  pageQueryKey,
  type ZilobaseAiMode,
  type Page,
  type PageItemPlacement,
} from "@zilobase/features/pages";

const modeConfig: Record<
  ZilobaseAiMode,
  {
    buttonLabel: string;
    createItemLabel: string;
    newPageTitle: string;
  }
> = {
  instruction: {
    buttonLabel: "Create instruction",
    createItemLabel: "Create instruction",
    newPageTitle: "My agent instruction",
  },
  skill: {
    buttonLabel: "Create skill",
    createItemLabel: "Create skill",
    newPageTitle: "My agent skill",
  },
};

type LinkablePageOption = {
  label: string;
  path: string;
  searchText: string;
  value: string;
  page: Page;
};

function buildLinkablePageOptions(
  pages: Page[],
  placements: PageItemPlacement[],
  excludedPageIds: Set<string>,
) {
  const pagesById = new Map(pages.map((page) => [page.id, page]));

  return pages
    .filter((page) => !excludedPageIds.has(page.id))
    .map<LinkablePageOption>((page) => {
      const label = page.name.trim() || "Untitled";
      const path = buildPagePath(pagesById, page.id, placements);

      return {
        label,
        path,
        searchText: `${label} ${path}`.trim(),
        value: page.id,
        page,
      };
    });
}

export function ZilobaseAiCreateMenu({
  existingPageIds,
  mode,
  workspaceId,
}: {
  existingPageIds: string[];
  mode: ZilobaseAiMode;
  workspaceId: string | null;
}) {
  const navigate = useNavigate();
  const { apiFetch, queryClient } = useZilobaseFeatures();
  const createPage = useCreatePage();
  const updatePage = useUpdatePage();
  const { data: navigation, isLoading: isLoadingPages } =
    usePageNavigation(workspaceId);
  const pages = navigation?.pages ?? [];
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const config = modeConfig[mode];
  const excludedIds = React.useMemo(
    () => new Set(existingPageIds),
    [existingPageIds],
  );
  const pageOptions = React.useMemo(
    () =>
      buildLinkablePageOptions(
        pages,
        navigation?.placements ?? [],
        excludedIds,
      ),
    [excludedIds, navigation?.placements, pages],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const filteredPageOptions = React.useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }

    return pageOptions.filter((option) =>
      option.searchText.toLowerCase().includes(normalizedQuery),
    );
  }, [normalizedQuery, pageOptions]);
  const isBusy = createPage.isPending || updatePage.isPending;

  React.useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  const closeMenu = () => {
    setOpen(false);
  };

  const openPage = (pageId: string) => {
    closeMenu();
    void navigate({
      params: { pageId },
      to: "/p/$pageId",
    });
  };

  const resolvePageMetadata = async (pageId: string) => {
    const cached = queryClient.getQueryData<Page | null>(pageQueryKey(pageId));

    if (cached?.metadata) {
      return cached.metadata;
    }

    const result = await apiFetch<{ page: Page }>(`/pages/${pageId}`, {
      method: "GET",
    });

    return result.page.metadata ?? {};
  };

  const assignExistingPage = async (pageId: string) => {
    if (!workspaceId || isBusy) {
      return;
    }

    try {
      const metadata = await resolvePageMetadata(pageId);

      await updatePage.mutateAsync({
        id: pageId,
        metadata: {
          ...metadata,
          zilobaseai: mode,
        },
      });

      toast.success(`Added as ${mode}.`);
      openPage(pageId);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  const createNewPage = async () => {
    if (!workspaceId || isBusy) {
      return;
    }

    try {
      const page = await createPage.mutateAsync({
        metadata: { zilobaseai: mode },
        name: config.newPageTitle,
        workspaceId,
      });

      toast.success(`Created ${mode}.`);
      openPage(page.id);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <DropDrawer onOpenChange={setOpen} open={open}>
      <DropDrawerTrigger asChild>
        <Button disabled={!workspaceId || isBusy} type="button">
          {isBusy ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
          {config.buttonLabel}
        </Button>
      </DropDrawerTrigger>
      <DropDrawerContent align="end" className="w-80 overflow-hidden p-0">
        <div className="flex flex-col">
          <div className="shrink-0 border-b bg-surface-overlay pt-3">
            <div className="flex items-center gap-1.5 px-3 pb-2.5">
              <SearchIcon className="size-4 shrink-0 text-content-secondary" />
              <Input
                aria-label="Search pages"
                autoFocus
                className="h-auto rounded-none border-0 bg-transparent px-0 py-0 text-sm font-medium shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search pages..."
                value={query}
              />
            </div>
          </div>

          <div className="h-56 overflow-y-auto overscroll-contain">
            {isLoadingPages ? (
              <DropDrawerItem disabled>Loading pages...</DropDrawerItem>
            ) : !normalizedQuery ? (
              <div className="px-3 py-6 text-center text-sm text-content-secondary">
                Type to search pages
              </div>
            ) : filteredPageOptions.length === 0 ? (
              <DropDrawerItem disabled>No pages found.</DropDrawerItem>
            ) : (
              filteredPageOptions.map((pageOption) => (
                <DropDrawerItem
                  key={pageOption.value}
                  onSelect={(event) => {
                    event.preventDefault();
                    void assignExistingPage(pageOption.value);
                  }}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <span className="flex size-4 shrink-0 items-center justify-center">
                      <PageIcon page={pageOption.page} />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate">{pageOption.label}</div>
                      {pageOption.path !== pageOption.label ? (
                        <div className="truncate text-xs text-content-secondary">
                          {pageOption.path}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </DropDrawerItem>
              ))
            )}
          </div>

          <div className="shrink-0 border-t bg-surface-overlay pb-3">
            <div className="px-3 pt-2.5">
              <DropDrawerItem
                onSelect={(event) => {
                  event.preventDefault();
                  void createNewPage();
                }}
              >
                <PlusIcon />
                <span>{config.createItemLabel}</span>
              </DropDrawerItem>
            </div>
          </div>
        </div>
      </DropDrawerContent>
    </DropDrawer>
  );
}
