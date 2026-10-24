import { useEffect, useState } from "react";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces/react";
import type { VerificationResource } from "@zilobase/features/pages";
import {
  ContentVerificationDialog,
  ContentVerificationMenuItem,
} from "@/sections/pages/header/components/content-verification";
import {
  ArrowUpRightIcon,
  Building2Icon,
  FolderInputIcon,
  LinkIcon,
  MoreHorizontalIcon,
  Trash2Icon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  LockIcon,
  MessageSquareTextIcon,
  StarIcon,
  StarOffIcon,
} from "@/components/icons";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerSeparator,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
  DropDrawerTrigger,
} from "@/components/ui/dropdrawer";
import { SidebarNavItemAction } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { type SidebarNavItem } from "@zilobase/features/pages";
import { useHeaderActions } from "@/components/navigation/hooks/use-navigation-actions";
import { SharePopover } from "@/components/sharing/components/share-popover";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePageCommentsSnapshot } from "@/sections/pages/editor/comments/components/comments-context";
import { Switch } from "@/components/ui/switch";
import { useSidebarEntryActions, copySidebarEntryLink } from "../hooks/use-navigation-actions";

const moreActions = [
  "Customize layout",
  "Copy Link",
  "Duplicate",
  "Move to Trash",
  "Version History",
];

export function HeaderActions({
  databaseId,
  discussionsOpen = false,
  onToggleDiscussions,
  onTogglePageSidebar,
  pageSidebarOpen = false,
  pageId,
  meetingId,
}: {
  databaseId?: string | null;
  discussionsOpen?: boolean;
  onToggleDiscussions?: () => void;
  onTogglePageSidebar?: () => void;
  pageSidebarOpen?: boolean;
  pageId?: string | null;
  meetingId?: string | null;
}) {
  const { item, favorite, lock, layout, moreMenu, trash } = useHeaderActions({
    databaseId,
    pageId,
    meetingId,
  });

  const workspaceId = useActiveWorkspaceId();
  const [verificationOpen, setVerificationOpen] = useState(false);
  useEffect(() => setVerificationOpen(false), [workspaceId, pageId, databaseId]);
  const verificationResource: VerificationResource | null =
    workspaceId && (databaseId || pageId)
      ? { workspaceId, type: databaseId ? "database" : "page", id: databaseId || pageId! }
      : null;
  const isMobile = useIsMobile();
  const comments = usePageCommentsSnapshot(pageId);
  const openDiscussionCount = comments.threads.filter((thread) => !thread.resolvedAt).length;
  const discussionsActionLabel = discussionsOpen ? "Close comments" : "Open comments";
  return (
    <ButtonGroup aria-label="Page actions" className="items-center gap-2 text-sm" variant="plain">
      <div className="hidden text-sm font-medium text-content-secondary md:inline-block">
        Edited recently
      </div>
      {item.hasActions ? (
        <>
          {pageId && onToggleDiscussions ? (
            <Button
              aria-label={discussionsActionLabel}
              aria-pressed={discussionsOpen}
              className={cn(
                "h-7 gap-1.5 px-2",
                discussionsOpen && "bg-action-neutral-pressed text-action-on-neutral",
              )}
              onClick={onToggleDiscussions}
              size="sm"
              title={discussionsActionLabel}
              type="button"
              variant="ghost"
            >
              <MessageSquareTextIcon />
              {openDiscussionCount > 0 ? <span>{openDiscussionCount}</span> : null}
            </Button>
          ) : null}
          {pageId && onTogglePageSidebar ? (
            <Button
              aria-label={pageSidebarOpen ? "Close page sidebar" : "Open page sidebar"}
              className={cn(
                "h-7 w-7",
                pageSidebarOpen && "bg-action-neutral-pressed text-action-on-neutral",
              )}
              onClick={onTogglePageSidebar}
              size="icon"
              title={pageSidebarOpen ? "Close page sidebar" : "Open page sidebar"}
              type="button"
              variant="ghost"
            >
              {pageSidebarOpen ? <ChevronsRightIcon /> : <ChevronsLeftIcon />}
            </Button>
          ) : null}
          {item.pageId || databaseId ? (
            <SharePopover databaseId={item.pageId ? undefined : databaseId} pageId={item.pageId} />
          ) : null}
          <Button
            aria-label={favorite.active ? "Remove from favorites" : "Add to favorites"}
            className={cn("h-7 w-7", favorite.active && "text-feedback-favorite")}
            disabled={favorite.disabled}
            onClick={favorite.toggle}
            size="icon"
            title={favorite.active ? "Remove from favorites" : "Add to favorites"}
            type="button"
            variant="ghost"
          >
            <StarIcon className={favorite.active ? "fill-current" : undefined} />
          </Button>
          <DropDrawer open={moreMenu.open} onOpenChange={moreMenu.setOpen}>
            <DropDrawerTrigger asChild>
              <Button
                aria-label="More page actions"
                variant="ghost"
                size="icon"
                className="h-7 w-7 data-[state=open]:bg-action-neutral-hover"
              >
                <MoreHorizontalIcon />
              </Button>
            </DropDrawerTrigger>
            <DropDrawerContent align="end" className="w-64 overflow-hidden rounded-lg p-1">
              <DropDrawerItem
                disabled={!lock.canToggle || lock.pending}
                onSelect={(event) => {
                  event.preventDefault();
                  lock.toggle();
                }}
              >
                <LockIcon />
                <span>{lock.label}</span>
                <Switch
                  checked={lock.active}
                  className="ml-auto pointer-events-none"
                  size="sm"
                  tabIndex={-1}
                />
              </DropDrawerItem>
              {!item.isDatabase && !isMobile ? (
                <>
                  <DropDrawerItem
                    disabled={layout.pending}
                    onSelect={(event) => {
                      event.preventDefault();
                      layout.toggle();
                    }}
                  >
                    <span>Full Width</span>
                    <Switch
                      checked={layout.fullWidth}
                      className="ml-auto pointer-events-none"
                      size="sm"
                      tabIndex={-1}
                    />
                  </DropDrawerItem>
                </>
              ) : null}
              {verificationResource ? (
                <ContentVerificationMenuItem
                  resource={verificationResource}
                  onOpen={() => setVerificationOpen(true)}
                />
              ) : null}
              {moreActions.map((label) => (
                <DropDrawerItem
                  className={
                    label === "Move to Trash"
                      ? "text-action-danger-text focus:text-action-danger-text"
                      : undefined
                  }
                  key={label}
                  disabled={moreMenu.isDisabled(label)}
                  onSelect={() => moreMenu.run(label)}
                >
                  <span>{label}</span>
                </DropDrawerItem>
              ))}
            </DropDrawerContent>
          </DropDrawer>
          <ContentVerificationDialog
            resource={verificationResource}
            open={verificationOpen}
            onOpenChange={setVerificationOpen}
          />
          <AlertDialog open={trash.open} onOpenChange={trash.setOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Move to trash?</AlertDialogTitle>
                <AlertDialogDescription>
                  {item.isDatabase
                    ? `${item.displayName} and its row pages will be moved to trash.`
                    : `${item.displayName} and its subpages will be moved to trash. Linked pages elsewhere will not be deleted.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={trash.pending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={trash.pending}
                  onClick={trash.confirm}
                  variant="destructive"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : null}
    </ButtonGroup>
  );
}

export function SidebarEntryMenu({
  item,
  favoriteOnly = false,
  onRemoveFavorite,
  onRemoveDatabaseFavorite,
}: {
  item: SidebarNavItem<unknown>;
  favoriteOnly?: boolean;
  onRemoveFavorite?: (id: string) => void;
  onRemoveDatabaseFavorite?: (id: string) => void;
}) {
  const {
    workspaceId,
    isMobile,
    openInNewTab,
    confirmOpen,
    setConfirmOpen,
    movePage,
    convertPage,
    teamspaces,
    displayName,
    isDeleting,
    linkPath,
    runDelete,
  } = useSidebarEntryActions(item);

  return (
    <>
      <DropDrawer>
        <DropDrawerTrigger asChild>
          <SidebarNavItemAction variant="menu">
            <MoreHorizontalIcon />
            <span className="sr-only">More</span>
          </SidebarNavItemAction>
        </DropDrawerTrigger>
        <DropDrawerContent
          align={isMobile ? "end" : "start"}
          className="w-56 rounded-lg"
          side={isMobile ? "bottom" : "right"}
        >
          {favoriteOnly && item.isFavorite ? (
            <>
              <DropDrawerItem
                onSelect={() => {
                  if (item.isDatabase && item.databaseId)
                    onRemoveDatabaseFavorite?.(item.databaseId);
                  else if (item.pageId) onRemoveFavorite?.(item.pageId);
                }}
              >
                <StarOffIcon className="text-content-secondary" />
                <span>Remove from Favorites</span>
              </DropDrawerItem>
              <DropDrawerSeparator />
            </>
          ) : null}
          <DropDrawerItem
            onSelect={() => {
              void copySidebarEntryLink(linkPath);
            }}
          >
            <LinkIcon className="text-content-secondary" />
            <span>Copy Link</span>
          </DropDrawerItem>
          <DropDrawerSeparator />
          <DropDrawerItem
            onSelect={() => {
              openInNewTab({ href: linkPath, title: displayName });
            }}
          >
            <ArrowUpRightIcon className="text-content-secondary" />
            <span>Open in New Tab</span>
          </DropDrawerItem>
          {!favoriteOnly && !item.isDatabase && !item.isDatabaseView && item.pageId ? (
            <DropDrawerSub>
              <DropDrawerSubTrigger>
                <FolderInputIcon className="text-content-secondary" />
                <span>Move to</span>
              </DropDrawerSubTrigger>
              <DropDrawerSubContent>
                <DropDrawerItem
                  disabled={!item.teamspaceId || movePage.isPending}
                  onSelect={() => {
                    if (!workspaceId || !item.pageId) return;
                    movePage.mutate(
                      { pageId: item.pageId, teamspaceId: null, workspaceId },
                      {
                        onError: (error) =>
                          toast.error(
                            error instanceof Error ? error.message : "Could not move page.",
                          ),
                        onSuccess: () => toast.success("Moved to Private."),
                      },
                    );
                  }}
                >
                  <span>Private</span>
                </DropDrawerItem>
                {teamspaces
                  .filter((teamspace) => teamspace.currentUserRole)
                  .map((teamspace) => (
                    <DropDrawerItem
                      disabled={item.teamspaceId === teamspace.id || movePage.isPending}
                      key={teamspace.id}
                      onSelect={() => {
                        if (!workspaceId || !item.pageId) return;
                        movePage.mutate(
                          { pageId: item.pageId, teamspaceId: teamspace.id, workspaceId },
                          {
                            onError: (error) =>
                              toast.error(
                                error instanceof Error ? error.message : "Could not move page.",
                              ),
                            onSuccess: () => toast.success(`Moved to ${teamspace.name}.`),
                          },
                        );
                      }}
                    >
                      <span>{teamspace.name}</span>
                    </DropDrawerItem>
                  ))}
                {!item.teamspaceId ? (
                  <>
                    <DropDrawerSeparator />
                    <DropDrawerItem
                      disabled={convertPage.isPending}
                      onSelect={() => {
                        if (!workspaceId || !item.pageId) return;
                        convertPage.mutate(
                          { name: displayName, pageId: item.pageId, workspaceId },
                          {
                            onError: (error) =>
                              toast.error(
                                error instanceof Error
                                  ? error.message
                                  : "Could not create teamspace.",
                              ),
                            onSuccess: () => toast.success("Page turned into a teamspace."),
                          },
                        );
                      }}
                    >
                      <Building2Icon />
                      <span>Turn into teamspace</span>
                    </DropDrawerItem>
                  </>
                ) : null}
              </DropDrawerSubContent>
            </DropDrawerSub>
          ) : null}
          {!favoriteOnly ? (
            <>
              <DropDrawerSeparator />
              <DropDrawerItem
                className="text-action-danger-text focus:text-action-danger-text"
                onSelect={() => {
                  setConfirmOpen(true);
                }}
              >
                <Trash2Icon className="text-action-danger-text" />
                <span>Delete</span>
              </DropDrawerItem>
            </>
          ) : null}
        </DropDrawerContent>
      </DropDrawer>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move to trash?</AlertDialogTitle>
            <AlertDialogDescription>
              {item.isDatabase
                ? `${displayName} and its row pages will be moved to trash.`
                : `${displayName} and its subpages will be moved to trash. Linked pages elsewhere will not be deleted.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isDeleting} onClick={runDelete} variant="destructive">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
