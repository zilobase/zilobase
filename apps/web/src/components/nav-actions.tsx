import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CheckIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ChevronsUpDownIcon,
  CircleAlertIcon,
  CloudCheckIcon,
  Globe2Icon,
  LinkIcon,
  LoaderCircleIcon,
  LockIcon,
  MoreHorizontalIcon,
  MessageSquareTextIcon,
  MailPlusIcon,
  Share2Icon,
  SparklesIcon,
  StarIcon,
  Trash2Icon,
  WifiOffIcon,
} from "@/components/icons";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
  DropDrawerTrigger,
} from "@/components/ui/dropdrawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@zilobase/features/auth";
import { useActiveWorkspaceId } from "@zilobase/features/workspaces";
import {
  useCreatePage,
  useDeletePage,
  useDeletePageAccess,
  useSetPageFavorite,
  useSetPagePublished,
  useUpdatePage,
  useUpsertPageAccess,
  usePage,
  usePageAccess,
  usePageAccessLevel,
  usePageAccessTargets,
  usePageNavigation,
  usePagePersonAccessTargets,
  usePageGuestInvitations,
  usePageGuestRequests,
  useInvitePageGuest,
  useCancelPageGuestInvitation,
  useRevokePageGuest,
} from "@zilobase/features/pages";
import { useWorkspaceGuestPolicy } from "@zilobase/features/workspaces";
import {
  useDatabase,
  useDatabaseAccess,
  useDeleteDatabaseAccess,
  useDeleteDatabase,
  useSetDatabaseFavorite,
  useSetDatabasePublished,
  isDatabaseLocked,
  useUpdateDatabase,
  useUpsertDatabaseAccess,
} from "@zilobase/features/databases";
import {
  useUpdateUserSettings,
  useUserSettings,
} from "@zilobase/features/user-settings";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { usePageCommentsSnapshot } from "@/contexts/page-comments-registry";
import { Switch } from "@/components/ui/switch";
import { useLayoutEditor } from "@/components/layout-editor";
import { OfflineAvailabilityAction } from "@/components/offline-availability-action";
import {
  useConnectivity,
  useOfflineManifest,
  useOfflineSessionLocked,
} from "@/providers/offline-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getPrimaryPageParentId,
  zilobaseAiModeLabels,
  resolvePageFullWidth,
  type AccessLevel,
  type AccessTargetType,
  type ZilobaseAiMode,
  type PageAccessRule,
  type PageMetadata,
} from "@zilobase/features/pages";

const zilobaseAiModes: ZilobaseAiMode[] = ["instruction", "skill"];

const moreActions = [
  "Customize layout",
  "Copy Link",
  "Duplicate",
  "Move to Trash",
  "Version History",
];

const accessLabels: Record<AccessLevel, string> = {
  comment: "Comment access",
  edit: "Edit access",
  full: "Full access",
  view: "View access",
};

type ShareTargetValue = `${AccessTargetType}:${string}`;

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
  const navigate = useNavigate();
  const { openLayoutEditor } = useLayoutEditor();
  const [isOpen, setIsOpen] = React.useState(false);
  const [trashConfirmOpen, setTrashConfirmOpen] = React.useState(false);
  const { data: databasePayload } = useDatabase(databaseId, {
    includeDeleted: true,
  });
  const workspaceId = useActiveWorkspaceId();
  const actionPageId = pageId ?? databasePayload?.database.pageId;
  const { data: page } = usePage(actionPageId, {
    refetchOnMount: false,
  });
  const { data: navigation } = usePageNavigation(workspaceId);
  const pages = navigation?.pages ?? [];
  const createPage = useCreatePage();
  const deletePage = useDeletePage();
  const deleteDatabase = useDeleteDatabase();
  const updateDatabase = useUpdateDatabase();
  const updatePage = useUpdatePage();
  const setFavorite = useSetPageFavorite();
  const setDatabaseFavorite = useSetDatabaseFavorite();
  const { data: userSettings } = useUserSettings();
  const updateUserSettings = useUpdateUserSettings();
  const isMobile = useIsMobile();
  const manifest = useOfflineManifest();
  const connectivity = useConnectivity();
  const offlineSessionLocked = useOfflineSessionLocked();
  const listPage = pages.find((item) => item.id === actionPageId);
  const isDatabasePage = Boolean(databaseId);
  const isMeetingPage = Boolean(meetingId);
  const hasPageActions = Boolean(actionPageId || databaseId);
  const comments = usePageCommentsSnapshot(pageId);
  const openDiscussionCount = comments.threads.filter((thread) => !thread.resolvedAt).length;
  const pageMetadata = (page?.metadata ?? {}) as PageMetadata;
  const { data: pageAccessLevel } = usePageAccessLevel(actionPageId, {
    refetchOnMount: false,
  });
  const effectiveFullWidth = resolvePageFullWidth(
    page,
    userSettings?.pageFullWidth,
  );
  const fullWidthUpdatePending =
    updateUserSettings.isPending || updatePage.isPending;
  const isFavorite = isDatabasePage
    ? Boolean(databasePayload?.database.isFavorite)
    : Boolean(page?.isFavorite ?? listPage?.isFavorite);
  const displayName =
    (isDatabasePage ? databasePayload?.database.name : page?.name)?.trim() ||
    "Untitled";
  const isDeleting = deletePage.isPending || deleteDatabase.isPending;
  const lockLabel = isMeetingPage
    ? "Lock meeting"
    : isDatabasePage
      ? "Lock database"
      : "Lock page";
  const locked = isMeetingPage
    ? pageMetadata.meetingLocked === true
    : isDatabasePage
      ? isDatabaseLocked(databasePayload?.database)
      : pageMetadata.locked === true;
  const canToggleLock = isDatabasePage
    ? databasePayload?.database.accessLevel === "edit" ||
      databasePayload?.database.accessLevel === "full" ||
      pageAccessLevel === "edit" ||
      pageAccessLevel === "full"
    : pageAccessLevel === "edit" || pageAccessLevel === "full";
  const lockUpdatePending = isDatabasePage
    ? updateDatabase.isPending
    : updatePage.isPending;
  const toggleLock = () => {
    if (lockUpdatePending || !canToggleLock) {
      return;
    }

    const onError = (error: unknown) => {
      toast.error(
        error instanceof Error
          ? error.message
          : `Could not update ${lockLabel.toLowerCase()}.`,
      );
    };

    if (isDatabasePage) {
      if (!databaseId || !databasePayload) {
        return;
      }

      updateDatabase.mutate(
        {
          databaseId,
          config: {
            ...((databasePayload.database.config ?? {}) as Record<string, unknown>),
            locked: !locked,
          },
        },
        { onError },
      );
      return;
    }

    if (!page) {
      return;
    }

    updatePage.mutate(
      {
        id: page.id,
        metadata: {
          ...pageMetadata,
          ...(isMeetingPage
            ? { meetingLocked: !locked }
            : { locked: !locked }),
        },
      },
      { onError },
    );
  };
  const toggleFavorite = () => {
    if (databaseId) {
      if (setDatabaseFavorite.isPending) {
        return;
      }

      setDatabaseFavorite.mutate(
        { databaseId, isFavorite: !isFavorite },
        {
          onError: (error) => {
            toast.error(
              error instanceof Error
                ? error.message
                : "Could not update favorite.",
            );
          },
        },
      );
      return;
    }

    if (!pageId || setFavorite.isPending) {
      return;
    }

    setFavorite.mutate(
      { isFavorite: !isFavorite, pageId },
      {
        onError: (error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not update favorite.",
          );
        },
      },
    );
  };
  const copyLink = async () => {
    if (!pageId && !databaseId) {
      return;
    }

    await navigator.clipboard.writeText(
      databaseId
        ? `${window.location.origin}/d/${databaseId}`
        : `${window.location.origin}/p/${pageId}`,
    );
    setIsOpen(false);
    toast.success(`${databaseId ? "Database" : "Page"} link copied.`);
  };
  const duplicatePage = async () => {
    if (!page || createPage.isPending) {
      return;
    }

    const metadata = (page.metadata ?? {}) as PageMetadata;
    try {
      const duplicate = await createPage.mutateAsync({
        content: clonePageContent(page.content ?? null),
        emoji: metadata.emoji ?? undefined,
        metadata,
        name: getDuplicatePageName(page.name),
        workspaceId: page.workspaceId,
        parentItemId: pageId
          ? (getPrimaryPageParentId(navigation?.placements ?? [], pageId) ??
            undefined)
          : undefined,
      });

      setIsOpen(false);
      toast.success("Page duplicated.");
      await navigate({
        to: "/p/$pageId",
        params: { pageId: duplicate.id },
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not duplicate page.",
      );
    }
  };
  const moveToTrash = () => {
    if (isDatabasePage) {
      if (!databaseId || deleteDatabase.isPending) {
        return;
      }

      deleteDatabase.mutate(databaseId, {
        onSuccess: () => {
          setTrashConfirmOpen(false);
          setIsOpen(false);
          toast.success("Moved to trash.");
          void navigate({ to: "/" });
        },
        onError: (error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not delete database.",
          );
        },
      });
      return;
    }

    if (!actionPageId || deletePage.isPending) {
      return;
    }

    deletePage.mutate(actionPageId, {
      onSuccess: () => {
        setTrashConfirmOpen(false);
        setIsOpen(false);
        toast.success("Moved to trash.");
        void navigate({ to: "/" });
      },
      onError: (error) => {
        toast.error(
          error instanceof Error ? error.message : "Could not delete page.",
        );
      },
    });
  };
  const runMoreAction = (label: string) => {
    if (label === "Customize layout") {
      setIsOpen(false);
      openLayoutEditor({ databaseId, pageId });
      return;
    }
    if (label === "Copy Link") {
      void copyLink();
      return;
    }

    if (label === "Duplicate") {
      void duplicatePage();
      return;
    }

    if (label === "Move to Trash") {
      setTrashConfirmOpen(true);
    }
  };
  const togglePageFullWidth = () => {
    if (isDatabasePage || fullWidthUpdatePending) {
      return;
    }

    updateUserSettings.mutate(
      { pageFullWidth: !userSettings?.pageFullWidth },
      {
        onError: (error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not update full width setting.",
          );
        },
      },
    );
  };
  const zilobaseAiMode = pageMetadata.zilobaseai ?? null;

  const setZilobaseAiMode = (mode: ZilobaseAiMode) => {
    if (!page || updatePage.isPending) {
      return;
    }

    updatePage.mutate(
      {
        id: page.id,
        metadata: {
          ...pageMetadata,
          zilobaseai: zilobaseAiMode === mode ? null : mode,
        },
      },
      {
        onError: (error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not update Zilobase AI setting.",
          );
        },
      },
    );
  };

  const discussionsActionLabel = discussionsOpen
    ? "Close discussions"
    : "Open discussions";
  const offlineItem = isDatabasePage
    ? manifest.items.find(
        (item) => item.kind === "database" && item.id === databaseId,
      )
    : manifest.items.find(
        (item) => item.kind === "page" && item.id === actionPageId,
      );

  return (
    <div className="flex items-center gap-2 text-sm">
      {offlineItem ? (
        <>
          <OfflineHeaderStatus
            blocked={Boolean(offlineItem.blocked)}
            connectivity={connectivity}
            dirty={Boolean(offlineItem.dirty)}
            sessionLocked={offlineSessionLocked}
          />
          <span
            aria-hidden="true"
            className="hidden text-xs text-muted-foreground md:inline"
          >
            ·
          </span>
        </>
      ) : null}
      <div className="hidden text-sm font-medium text-muted-foreground md:inline-block">
        Edited recently
      </div>
      {hasPageActions ? (
        <>
          {pageId && onToggleDiscussions ? (
            <Button
              aria-label={discussionsActionLabel}
              aria-pressed={discussionsOpen}
              className={cn(
                "h-7 gap-1.5 px-2",
                discussionsOpen && "bg-active text-active-foreground",
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
                pageSidebarOpen && "bg-active text-active-foreground",
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
          {actionPageId || databaseId ? (
            <ItemShareDropdown
              databaseId={actionPageId ? undefined : databaseId}
              pageId={actionPageId}
            />
          ) : null}
          <Button
            aria-label={
              isFavorite ? "Remove from favorites" : "Add to favorites"
            }
            className={cn("h-7 w-7", isFavorite && "text-status-favorite")}
            disabled={
              databaseId
                ? !databasePayload || setDatabaseFavorite.isPending
                : !pageId || setFavorite.isPending
            }
            onClick={toggleFavorite}
            size="icon"
            title={isFavorite ? "Remove from favorites" : "Add to favorites"}
            type="button"
            variant="ghost"
          >
            <StarIcon className={isFavorite ? "fill-current" : undefined} />
          </Button>
          <DropDrawer open={isOpen} onOpenChange={setIsOpen}>
            <DropDrawerTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 data-[state=open]:bg-accent"
              >
                <MoreHorizontalIcon />
              </Button>
            </DropDrawerTrigger>
            <DropDrawerContent
              align="end"
              className="w-64 overflow-hidden rounded-lg p-1"
            >
              <OfflineAvailabilityAction
                databaseId={databaseId}
                name={displayName}
                pageId={actionPageId}
                workspaceId={workspaceId}
              />
              <DropDrawerItem
                disabled={!canToggleLock || lockUpdatePending}
                onSelect={(event) => {
                  event.preventDefault();
                  toggleLock();
                }}
              >
                <LockIcon />
                <span>{lockLabel}</span>
                <Switch
                  checked={locked}
                  className="ml-auto pointer-events-none"
                  size="sm"
                  tabIndex={-1}
                />
              </DropDrawerItem>
              {!isDatabasePage && !isMobile ? (
                <>
                  <DropDrawerItem
                    disabled={fullWidthUpdatePending}
                    onSelect={(event) => {
                      event.preventDefault();
                      togglePageFullWidth();
                    }}
                  >
                    <span>Full Width</span>
                    <Switch
                      checked={effectiveFullWidth}
                      className="ml-auto pointer-events-none"
                      size="sm"
                      tabIndex={-1}
                    />
                  </DropDrawerItem>
                </>
              ) : null}
              {!isDatabasePage ? (
                <ZilobaseAiSubmenu
                  disabled={!page || updatePage.isPending}
                  mode={zilobaseAiMode}
                  onSelect={setZilobaseAiMode}
                />
              ) : null}
              {moreActions.map((label) => (
                <DropDrawerItem
                  className={
                    label === "Move to Trash"
                      ? "text-destructive focus:text-destructive"
                      : undefined
                  }
                  key={label}
                  disabled={
                    (label === "Copy Link" && !pageId && !databaseId) ||
                    (label === "Duplicate" &&
                      (isDatabasePage || !page || createPage.isPending)) ||
                    (label === "Move to Trash" &&
                      ((!actionPageId && !databaseId) || isDeleting))
                  }
                  onSelect={() => runMoreAction(label)}
                >
                  <span>{label}</span>
                </DropDrawerItem>
              ))}
            </DropDrawerContent>
          </DropDrawer>
          <AlertDialog
            open={trashConfirmOpen}
            onOpenChange={setTrashConfirmOpen}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Move to trash?</AlertDialogTitle>
                <AlertDialogDescription>
                  {isDatabasePage
                    ? `${displayName} and its row pages will be moved to trash.`
                    : `${displayName} and its subpages will be moved to trash. Linked pages elsewhere will not be deleted.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={isDeleting}
                  onClick={moveToTrash}
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

function OfflineHeaderStatus({
  blocked,
  connectivity,
  dirty,
  sessionLocked,
}: {
  blocked: boolean;
  connectivity: ReturnType<typeof useConnectivity>;
  dirty: boolean;
  sessionLocked: boolean;
}) {
  const status = sessionLocked
    ? {
        className: "text-destructive",
        icon: WifiOffIcon,
        label: "Session expired",
        title: "Offline session expired — reconnect and sign in",
      }
    : blocked
      ? {
          className: "text-destructive",
          icon: CircleAlertIcon,
          label: "Sync blocked",
          title: "Sync blocked — page access may have changed",
        }
      : connectivity === "offline" || connectivity === "service-unavailable"
        ? {
            className: "text-muted-foreground",
            icon: WifiOffIcon,
            label: "Offline",
            title: "Offline — this item is stored on this Mac",
          }
        : connectivity === "checking" || dirty
          ? {
              className: "text-muted-foreground",
              icon: LoaderCircleIcon,
              label: "Syncing",
              title: "Syncing offline changes",
            }
          : {
              className: "text-muted-foreground",
              icon: CloudCheckIcon,
              label: "Synced",
              title: "Available offline and synced",
            };
  const StatusIcon = status.icon;

  return (
    <div
      aria-live="polite"
      className={cn(
        "flex shrink-0 items-center gap-1.5 text-xs/relaxed font-normal",
        status.className,
      )}
      role="status"
      title={status.title}
    >
      <StatusIcon
        aria-hidden="true"
        className={cn(
          "size-3.5",
          StatusIcon === LoaderCircleIcon && "animate-spin",
        )}
      />
      <span className="hidden sm:inline">{status.label}</span>
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
        {mode ? <span className="text-muted-foreground">{mode}</span> : null}
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

function getDuplicatePageName(name: string) {
  const trimmedName = name.trim() || "Untitled";

  return `${trimmedName} copy`;
}

function clonePageContent(content: unknown) {
  const cloned = typeof structuredClone === "function"
    ? structuredClone(content)
    : JSON.parse(JSON.stringify(content)) as unknown;

  return stripCommentMarks(cloned);
}

function stripCommentMarks(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripCommentMarks);
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => [
      key,
      key === "marks" && Array.isArray(child)
        ? child.filter(
            (mark) =>
              !mark ||
              typeof mark !== "object" ||
              (mark as { type?: unknown }).type !== "comment",
          ).map(stripCommentMarks)
        : stripCommentMarks(child),
    ]),
  );
}

function ItemShareDropdown({
  databaseId,
  pageId,
}: {
  databaseId?: string | null;
  pageId?: string | null;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          className="h-7 gap-2 data-[state=open]:bg-accent"
          size="sm"
          variant="outline"
        >
          <LockIcon />
          Share
        </Button>
      </PopoverTrigger>
      {open ? (
        <ItemShareDropdownContent databaseId={databaseId} pageId={pageId} />
      ) : null}
    </Popover>
  );
}

function ItemShareDropdownContent({
  databaseId,
  pageId,
}: {
  databaseId?: string | null;
  pageId?: string | null;
}) {
  const workspaceId = useActiveWorkspaceId();
  const { data: session } = useSession();
  const { data: page } = usePage(pageId);
  const { data: accessLevel } = usePageAccessLevel(pageId);
  const { data: accessPayload } = usePageAccess(pageId);
  const { data: databasePayload } = useDatabase(databaseId);
  const { data: databaseAccessPayload } = useDatabaseAccess(databaseId);
  const { data: targets } = usePageAccessTargets(workspaceId);
  const { data: personTargets } = usePagePersonAccessTargets(pageId, {
    enabled: Boolean(pageId && !databaseId),
  });
  const { data: guestInvitations } = usePageGuestInvitations(
    databaseId ? null : pageId,
  );
  const { data: guestRequests } = usePageGuestRequests(
    databaseId ? null : pageId,
  );
  const { data: guestPolicy } = useWorkspaceGuestPolicy(workspaceId, {
    enabled: Boolean(
      pageId &&
        !databaseId &&
        targets?.members.some((member) => member.id === session?.user?.id),
    ),
  });
  const upsertAccess = useUpsertPageAccess();
  const upsertDatabaseAccess = useUpsertDatabaseAccess();
  const deleteAccess = useDeletePageAccess();
  const deleteDatabaseAccess = useDeleteDatabaseAccess();
  const setPublished = useSetPagePublished();
  const setDatabasePublished = useSetDatabasePublished();
  const inviteGuest = useInvitePageGuest();
  const cancelGuestInvitation = useCancelPageGuestInvitation();
  const revokeGuest = useRevokePageGuest();
  const [targetValue, setTargetValue] = React.useState<ShareTargetValue | "">(
    "",
  );
  const [targetPickerOpen, setTargetPickerOpen] = React.useState(false);
  const [nextAccessLevel, setNextAccessLevel] =
    React.useState<AccessLevel>("view");
  const [guestEmail, setGuestEmail] = React.useState("");
  const [guestAccessLevel, setGuestAccessLevel] =
    React.useState<AccessLevel>("view");
  const isDatabase = Boolean(databaseId);
  const effectiveAccessLevel = isDatabase
    ? databasePayload?.database.accessLevel
    : accessLevel;
  const canManage = effectiveAccessLevel === "full";
  const isWorkspaceMember = Boolean(
    targets?.members.some((member) => member.id === session?.user?.id),
  );
  const shareableMembers = React.useMemo(
    () =>
      (targets?.members ?? []).filter(
        (member) => member.id !== session?.user?.id,
      ),
    [session?.user?.id, targets?.members],
  );
  const targetByKey = React.useMemo(() => {
    const map = new Map<string, { label: string; detail?: string }>();

    for (const member of targets?.members ?? []) {
      map.set(`user:${member.id}`, {
        detail: member.email,
        label: member.name || member.email,
      });
    }

    for (const guest of personTargets?.guests ?? []) {
      map.set(`user:${guest.id}`, {
        detail: `${guest.email} · Guest`,
        label: guest.name || guest.email,
      });
    }

    return map;
  }, [personTargets?.guests, targets?.members]);
  const guestUserIds = React.useMemo(
    () => new Set((personTargets?.guests ?? []).map((guest) => guest.id)),
    [personTargets?.guests],
  );
  const rules = isDatabase
    ? (databaseAccessPayload?.access ?? [])
    : (accessPayload?.access ?? []);
  const isPublished = rules.some(
    (rule) => rule.targetType === "public" && rule.targetId === "*",
  );
  const sharingRules = rules.filter((rule) => rule.targetType !== "public");
  const pendingGuestInvitations = (guestInvitations ?? []).filter(
    (invitation) => invitation.status === "pending",
  );
  const pendingGuestRequests = (guestRequests ?? []).filter(
    (request) => request.status === "pending",
  );
  const guestActionLabel =
    guestPolicy?.mode === "request" && !guestPolicy.canApprove
      ? "Request"
      : "Invite";
  const selectedTarget = targetValue ? targetByKey.get(targetValue) : null;
  const publicUrl =
    typeof window === "undefined"
      ? ""
      : isDatabase
        ? `${window.location.origin}/d/${databaseId}`
        : `${window.location.origin}/p/${pageId}`;

  const shareItem = () => {
    if (!targetValue || (!page && !databaseId)) {
      return;
    }

    const [targetType, targetId] = targetValue.split(":") as [
      AccessTargetType,
      string,
    ];

    const options = {
      onSuccess: () => {
        setTargetValue("");
        toast.success(`${isDatabase ? "Database" : "Page"} access updated.`);
      },
      onError: (error: Error) => {
        toast.error(error.message || "Could not share.");
      },
    };

    if (isDatabase) {
      upsertDatabaseAccess.mutate(
        {
          accessLevel:
            nextAccessLevel === "comment" ? "view" : nextAccessLevel,
          targetId,
          targetType,
          databaseId: databaseId as string,
        },
        options,
      );
      return;
    }

    upsertAccess.mutate(
      {
        accessLevel: nextAccessLevel,
        targetId,
        targetType,
        pageId: page?.id as string,
      },
      options,
    );
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(publicUrl || window.location.href);
    toast.success("Page link copied.");
  };

  const invitePageGuest = () => {
    const email = guestEmail.trim().toLowerCase();

    if (
      !pageId ||
      !email ||
      !canManage ||
      !isWorkspaceMember ||
      inviteGuest.isPending
    ) return;
    inviteGuest.mutate(
      { accessLevel: guestAccessLevel, email, pageId },
      {
        onError: (error) =>
          toast.error(
            error instanceof Error ? error.message : "Could not invite guest.",
          ),
        onSuccess: (result) => {
          setGuestEmail("");
          toast.success(
            result.request
              ? "Guest invitation sent for owner approval."
              : "Page guest invitation sent.",
          );
        },
      },
    );
  };

  const togglePublished = (checked: boolean) => {
    const publishingPending = isDatabase
      ? setDatabasePublished.isPending
      : setPublished.isPending;
    if ((!page && !databaseId) || !canManage || publishingPending) {
      return;
    }

    const options = {
      onSuccess: () => {
        toast.success(checked ? "Page published." : "Page unpublished.");
      },
      onError: (error: Error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not update publishing.",
        );
      },
    };

    if (isDatabase) {
      setDatabasePublished.mutate(
        { isPublished: checked, databaseId: databaseId as string },
        options,
      );
      return;
    }

    setPublished.mutate(
      { isPublished: checked, pageId: page?.id as string },
      options,
    );
  };

  return (
    <PopoverContent
      align="end"
      className="w-[min(36rem,calc(100vw-2rem))] p-4"
      onOpenAutoFocus={(event) => event.preventDefault()}
    >
      <div className="mb-4 grid gap-1.5">
        <div className="font-semibold leading-none tracking-tight">
          Share {isDatabase ? "database" : "page"}
        </div>
        <div className="text-sm text-muted-foreground">
          Access applies to this{" "}
          {isDatabase ? "database" : "page and nested pages"}.
        </div>
      </div>

      <Tabs defaultValue="share">
        <TabsList>
          <TabsTrigger value="share">Share</TabsTrigger>
          <TabsTrigger value="publish">Publishing</TabsTrigger>
        </TabsList>

        <TabsContent className="grid gap-4 pt-2" value="share">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Popover open={targetPickerOpen} onOpenChange={setTargetPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  className="min-w-0 flex-1 justify-between"
                  disabled={!canManage}
                  role="combobox"
                  type="button"
                  variant="outline"
                >
                  <span className="min-w-0 truncate text-left">
                    {selectedTarget?.detail ?? "Search members"}
                  </span>
                  <ChevronsUpDownIcon className="opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-[min(28rem,calc(100vw-3rem))] p-0"
              >
                <Command>
                  <CommandInput placeholder="Search by name or email..." />
                  <CommandList>
                    <CommandEmpty>No members found.</CommandEmpty>
                    <CommandGroup>
                      {shareableMembers.map((member) => {
                        const value: ShareTargetValue = `user:${member.id}`;
                        const label = member.name || member.email;

                        return (
                          <CommandItem
                            data-checked={targetValue === value}
                            key={member.id}
                            onSelect={() => {
                              setTargetValue(value);
                              setTargetPickerOpen(false);
                            }}
                            value={`${member.email} ${member.name}`}
                          >
                            <div className="min-w-0">
                              <div className="truncate font-medium">
                                {label}
                              </div>
                              <div className="truncate text-xs text-muted-foreground">
                                {member.email}
                              </div>
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Select
              disabled={!canManage}
              onValueChange={(value) =>
                setNextAccessLevel(value as AccessLevel)
              }
              value={nextAccessLevel}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="view">View</SelectItem>
                {!isDatabase ? (
                  <SelectItem value="comment">Comment</SelectItem>
                ) : null}
                <SelectItem value="edit">Edit</SelectItem>
                <SelectItem value="full">Full</SelectItem>
              </SelectContent>
            </Select>
            <Button
              disabled={
                !canManage ||
                !targetValue ||
                upsertAccess.isPending ||
                upsertDatabaseAccess.isPending
              }
              onClick={shareItem}
              type="button"
            >
              <Share2Icon />
              Share
            </Button>
          </div>

          {!isDatabase && canManage && isWorkspaceMember ? (
            <div className="grid gap-2 rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Invite a page guest</div>
                <div className="text-xs text-muted-foreground">
                  Guests can access this page and its nested pages, but not the
                  workspace.
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  aria-label="Guest email"
                  className="min-w-0 flex-1"
                  onChange={(event) => setGuestEmail(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      invitePageGuest();
                    }
                  }}
                  placeholder="guest@example.com"
                  type="email"
                  value={guestEmail}
                />
                <Select
                  onValueChange={(value) =>
                    setGuestAccessLevel(value as AccessLevel)
                  }
                  value={guestAccessLevel}
                >
                  <SelectTrigger className="sm:w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="view">View</SelectItem>
                    <SelectItem value="comment">Comment</SelectItem>
                    <SelectItem value="edit">Edit</SelectItem>
                    <SelectItem value="full">Full</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  disabled={!guestEmail.trim() || inviteGuest.isPending}
                  onClick={invitePageGuest}
                  type="button"
                >
                  <MailPlusIcon />
                  {guestActionLabel}
                </Button>
              </div>
              {pendingGuestInvitations.length > 0 ? (
                <div className="grid gap-1 border-t pt-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Pending guest invitations
                  </div>
                  {pendingGuestInvitations.map((invitation) => (
                    <div
                      className="flex items-center gap-2 text-sm"
                      key={invitation.id}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {invitation.email}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {invitation.accessLevel}
                      </span>
                      <Button
                        aria-label={`Cancel invitation for ${invitation.email}`}
                        disabled={cancelGuestInvitation.isPending}
                        onClick={() =>
                          cancelGuestInvitation.mutate(
                            { invitationId: invitation.id, pageId: pageId as string },
                            {
                              onError: (error) =>
                                toast.error(
                                  error instanceof Error
                                    ? error.message
                                    : "Could not cancel invitation.",
                                ),
                            },
                          )
                        }
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
              {pendingGuestRequests.length > 0 ? (
                <div className="grid gap-1 border-t pt-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Pending owner approval
                  </div>
                  {pendingGuestRequests.map((request) => (
                    <div className="flex items-center gap-2 text-sm" key={request.id}>
                      <span className="min-w-0 flex-1 truncate">{request.email}</span>
                      <span className="text-xs text-muted-foreground">
                        {request.accessLevel}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-2">
            <AccessRow
              detail={session?.user?.email}
              label={session?.user?.name || "You"}
              level={effectiveAccessLevel ?? "view"}
              suffix="You"
            />
            {sharingRules.map((rule) => (
              <RuleRow
                canManage={canManage}
                deleteRule={() =>
                  isDatabase
                    ? deleteDatabaseAccess.mutate(
                        { ruleId: rule.id, databaseId: databaseId as string },
                        {
                          onError: (error) => {
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : "Could not remove access.",
                            );
                          },
                        },
                      )
                    : guestUserIds.has(rule.targetId)
                      ? revokeGuest.mutate(
                          {
                            pageId: pageId as string,
                            userId: rule.targetId,
                          },
                          {
                            onError: (error) => {
                              toast.error(
                                error instanceof Error
                                  ? error.message
                                  : "Could not remove guest access.",
                              );
                            },
                          },
                        )
                      : deleteAccess.mutate(
                        { ruleId: rule.id, pageId: pageId as string },
                        {
                          onError: (error) => {
                            toast.error(
                              error instanceof Error
                                ? error.message
                                : "Could not remove access.",
                            );
                          },
                        },
                      )
                }
                key={rule.id}
                rule={rule}
                target={targetByKey.get(`${rule.targetType}:${rule.targetId}`)}
              />
            ))}
          </div>

          {!canManage ? (
            <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              You need full access to manage sharing for this{" "}
              {isDatabase ? "database" : "page"}.
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <Input readOnly value={publicUrl} />
            <Button onClick={copyLink} type="button" variant="outline">
              <LinkIcon />
              Copy link
            </Button>
          </div>
        </TabsContent>

        <TabsContent className="grid gap-4 pt-2" value="publish">
          <div className="flex items-start gap-3 rounded-md border px-3 py-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
              <Globe2Icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Publish to web</div>
              <div className="text-xs text-muted-foreground">
                Anyone with the link can view this{" "}
                {isDatabase ? "database" : "page and nested pages"}. Published
                content is read-only.
              </div>
            </div>
            <Switch
              checked={isPublished}
              disabled={
                !canManage ||
                setPublished.isPending ||
                setDatabasePublished.isPending
              }
              onCheckedChange={togglePublished}
            />
          </div>

          {!canManage ? (
            <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              You need full access to manage publishing for this{" "}
              {isDatabase ? "database" : "page"}.
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <Input readOnly value={publicUrl} />
            <Button
              disabled={!isPublished}
              onClick={copyLink}
              type="button"
              variant="outline"
            >
              <LinkIcon />
              Copy link
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </PopoverContent>
  );
}

function RuleRow({
  canManage,
  deleteRule,
  rule,
  target,
}: {
  canManage: boolean;
  deleteRule: () => void;
  rule: Pick<PageAccessRule, "accessLevel" | "targetId" | "targetType">;
  target?: { detail?: string; label: string };
}) {
  return (
    <div className="flex min-h-11 items-center gap-3 rounded-md border px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {target?.label ?? "Unknown target"}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {target?.detail ?? rule.targetType}
        </div>
      </div>
      <span className="text-xs text-muted-foreground">
        {accessLabels[rule.accessLevel]}
      </span>
      {canManage ? (
        <Button
          aria-label="Remove access"
          onClick={deleteRule}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Trash2Icon />
        </Button>
      ) : null}
    </div>
  );
}

function AccessRow({
  detail,
  label,
  level,
  suffix,
}: {
  detail?: string;
  label: string;
  level: AccessLevel;
  suffix?: string;
}) {
  return (
    <div className="flex min-h-11 items-center gap-3 rounded-md border px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {label}{" "}
          {suffix ? (
            <span className="text-muted-foreground">({suffix})</span>
          ) : null}
        </div>
        <div className="truncate text-xs text-muted-foreground">{detail}</div>
      </div>
      <span className="text-xs text-muted-foreground">
        {accessLabels[level]}
      </span>
    </div>
  );
}
