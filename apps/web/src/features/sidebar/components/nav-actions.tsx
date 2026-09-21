import { useNavigationItemActions } from "../commands/use-navigation-item-actions";
import { ItemShareDropdown } from "./item-share-dropdown";

import { CheckIcon, ChevronsLeftIcon, ChevronsRightIcon, LockIcon, MoreHorizontalIcon, MessageSquareTextIcon, SparklesIcon, StarIcon } from "@/shared/components/icons";

import { Button } from "@/shared/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";

import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
  DropDrawerTrigger,
} from "@/shared/ui/dropdrawer";

import { useIsMobile } from "@/shared/hooks/use-mobile";
import { cn } from "@/shared/lib/utils";
import { usePageCommentsSnapshot } from "@/features/comments/index";
import { Switch } from "@/shared/ui/switch";

import { zilobaseAiModeLabels, type ZilobaseAiMode } from "@zilobase/features/pages";

const zilobaseAiModes: ZilobaseAiMode[] = ["instruction", "skill"];

const moreActions = [
  "Customize layout",
  "Copy Link",
  "Duplicate",
  "Move to Trash",
  "Version History",
];

export function NavActions({
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
  const { item, favorite, lock, layout, aiMode, moreMenu, trash } = useNavigationItemActions({databaseId, pageId, meetingId});

const isMobile = useIsMobile();
const comments = usePageCommentsSnapshot(pageId);
const openDiscussionCount = comments.threads.filter((thread) => !thread.resolvedAt).length;
  const discussionsActionLabel = discussionsOpen
    ? "Close discussions"
    : "Open discussions";
  return (
    <div className="flex items-center gap-2 text-sm">
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
              aria-label={
                pageSidebarOpen ? "Close page sidebar" : "Open page sidebar"
              }
              className={cn(
                "h-7 w-7",
                pageSidebarOpen && "bg-action-neutral-pressed text-action-on-neutral",
              )}
              onClick={onTogglePageSidebar}
              size="icon"
              title={
                pageSidebarOpen ? "Close page sidebar" : "Open page sidebar"
              }
              type="button"
              variant="ghost"
            >
              {pageSidebarOpen ? (
                <ChevronsRightIcon />
              ) : (
                <ChevronsLeftIcon />
              )}
            </Button>
          ) : null}
          {item.pageId || databaseId ? (
            <ItemShareDropdown
              databaseId={item.pageId ? undefined : databaseId}
              pageId={item.pageId}
            />
          ) : null}
          <Button
            aria-label={
              favorite.active ? "Remove from favorites" : "Add to favorites"
            }
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
                variant="ghost"
                size="icon"
                className="h-7 w-7 data-[state=open]:bg-action-neutral-hover"
              >
                <MoreHorizontalIcon />
              </Button>
            </DropDrawerTrigger>
            <DropDrawerContent
              align="end"
              className="w-64 overflow-hidden rounded-lg p-1"
            >
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
              {!item.isDatabase ? (
                <ZilobaseAiSubmenu
                  disabled={aiMode.disabled}
                  mode={aiMode.value}
                  onSelect={aiMode.set}
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
          <AlertDialog
            open={trash.open}
            onOpenChange={trash.setOpen}
          >
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
                <AlertDialogCancel disabled={trash.pending}>
                  Cancel
                </AlertDialogCancel>
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
    </div>
  );
}

function ZilobaseAiSubmenu({
  disabled,
  mode,
  onSelect,
}: {
  disabled: boolean;
  mode: ZilobaseAiMode | null;
  onSelect: (mode: ZilobaseAiMode) => void;
}) {
  return (
    <DropDrawerSub>
      <DropDrawerSubTrigger disabled={disabled}>
        <SparklesIcon />
        <span className="flex-1">Zilobase AI</span>
        {mode ? <span className="text-content-secondary">{mode}</span> : null}
      </DropDrawerSubTrigger>
      <DropDrawerSubContent className="w-64">
        {zilobaseAiModes.map((value) => (
          <DropDrawerItem
            key={value}
            disabled={disabled}
            onSelect={(event) => {
              event.preventDefault();
              onSelect(value);
            }}
          >
            <span>{zilobaseAiModeLabels[value]}</span>
            {mode === value ? <CheckIcon className="ml-auto" /> : null}
          </DropDrawerItem>
        ))}
      </DropDrawerSubContent>
    </DropDrawerSub>
  );
}
