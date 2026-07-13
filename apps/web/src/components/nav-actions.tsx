import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CheckIcon,
  ChevronsUpDownIcon,
  Globe2Icon,
  LinkIcon,
  LockIcon,
  MoreHorizontalIcon,
  Share2Icon,
  SparklesIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { useSession } from "@notelab/features/auth";
import { useActiveWorkspaceId } from "@notelab/features/integrations";
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
} from "@notelab/features/pages";
import {
  useDatabase,
  useDatabaseAccess,
  useDeleteDatabaseAccess,
  useDeleteDatabase,
  useSetDatabaseFavorite,
  useSetDatabasePublished,
  useUpsertDatabaseAccess,
} from "@notelab/features/databases";
import {
  useUpdateUserSettings,
  useUserSettings,
} from "@notelab/features/user-settings";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useLayoutEditor } from "@/components/layout-editor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getPrimaryPageParentId,
  notelabAiModeLabels,
  resolvePageFullWidth,
  type AccessLevel,
  type AccessTargetType,
  type NotelabAiMode,
  type PageAccessRule,
  type PageMetadata,
} from "@notelab/features/pages";

const notelabAiModes: NotelabAiMode[] = ["instruction", "skill"];

const moreActions = [
  "Customize layout",
  "Copy Link",
  "Duplicate",
  "Move to Trash",
  "Version History",
];

const accessLabels: Record<AccessLevel, string> = {
  edit: "Edit access",
  full: "Full access",
  view: "View access",
};

type ShareTargetValue = `${AccessTargetType}:${string}`;

export function NavActions({
  databaseId,
  pageId,
}: {
  databaseId?: string | null;
  pageId?: string | null;
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
  const updatePage = useUpdatePage();
  const setFavorite = useSetPageFavorite();
  const setDatabaseFavorite = useSetDatabaseFavorite();
  const { data: userSettings } = useUserSettings();
  const updateUserSettings = useUpdateUserSettings();
  const isMobile = useIsMobile();
  const listPage = pages.find((item) => item.id === actionPageId);
  const isDatabasePage = Boolean(databaseId);
  const hasPageActions = Boolean(actionPageId || databaseId);
  const pageMetadata = (page?.metadata ?? {}) as PageMetadata;
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
  const notelabAiMode = pageMetadata.notelabai ?? null;

  const setNotelabAiMode = (mode: NotelabAiMode) => {
    if (!page || updatePage.isPending) {
      return;
    }

    updatePage.mutate(
      {
        id: page.id,
        metadata: {
          ...pageMetadata,
          notelabai: notelabAiMode === mode ? null : mode,
        },
      },
      {
        onError: (error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not update Notelab AI setting.",
          );
        },
      },
    );
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="hidden font-medium text-muted-foreground md:inline-block">
        Edited recently
      </div>
      {hasPageActions ? (
        <>
          {actionPageId || databaseId ? (
            <ItemShareDialog
              databaseId={actionPageId ? undefined : databaseId}
              pageId={actionPageId}
            />
          ) : null}
          <Button
            aria-label={
              isFavorite ? "Remove from favorites" : "Add to favorites"
            }
            className={cn("h-7 w-7", isFavorite && "text-yellow-500")}
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
                <NotelabAiSubmenu
                  disabled={!page || updatePage.isPending}
                  mode={notelabAiMode}
                  onSelect={setNotelabAiMode}
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

function NotelabAiSubmenu({
  disabled,
  mode,
  onSelect,
}: {
  disabled: boolean;
  mode: NotelabAiMode | null;
  onSelect: (mode: NotelabAiMode) => void;
}) {
  return (
    <DropDrawerSub>
      <DropDrawerSubTrigger disabled={disabled}>
        <SparklesIcon />
        <span className="flex-1">Notelab AI</span>
        {mode ? <span className="text-muted-foreground">{mode}</span> : null}
      </DropDrawerSubTrigger>
      <DropDrawerSubContent className="w-64">
        {notelabAiModes.map((value) => (
          <DropDrawerItem
            key={value}
            disabled={disabled}
            onSelect={(event) => {
              event.preventDefault();
              onSelect(value);
            }}
          >
            <span>{notelabAiModeLabels[value]}</span>
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
  if (typeof structuredClone === "function") {
    return structuredClone(content);
  }

  return JSON.parse(JSON.stringify(content)) as unknown;
}

function ItemShareDialog({
  databaseId,
  pageId,
}: {
  databaseId?: string | null;
  pageId?: string | null;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button className="h-8 gap-2" size="sm" variant="outline">
          <LockIcon />
          Share
        </Button>
      </DialogTrigger>
      {open ? (
        <ItemShareDialogContent databaseId={databaseId} pageId={pageId} />
      ) : null}
    </Dialog>
  );
}

function ItemShareDialogContent({
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
  const upsertAccess = useUpsertPageAccess();
  const upsertDatabaseAccess = useUpsertDatabaseAccess();
  const deleteAccess = useDeletePageAccess();
  const deleteDatabaseAccess = useDeleteDatabaseAccess();
  const setPublished = useSetPagePublished();
  const setDatabasePublished = useSetDatabasePublished();
  const [targetValue, setTargetValue] = React.useState<ShareTargetValue | "">(
    "",
  );
  const [targetPickerOpen, setTargetPickerOpen] = React.useState(false);
  const [nextAccessLevel, setNextAccessLevel] =
    React.useState<AccessLevel>("view");
  const isDatabase = Boolean(databaseId);
  const effectiveAccessLevel = isDatabase
    ? databasePayload?.database.accessLevel
    : accessLevel;
  const canManage = effectiveAccessLevel === "full";
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

    return map;
  }, [targets?.members]);
  const rules = isDatabase
    ? (databaseAccessPayload?.access ?? [])
    : (accessPayload?.access ?? []);
  const isPublished = rules.some(
    (rule) => rule.targetType === "public" && rule.targetId === "*",
  );
  const sharingRules = rules.filter((rule) => rule.targetType !== "public");
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
          accessLevel: nextAccessLevel,
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
    <DialogContent
      className="sm:max-w-xl"
      onOpenAutoFocus={(event) => event.preventDefault()}
    >
      <DialogHeader>
        <DialogTitle>Share {isDatabase ? "database" : "page"}</DialogTitle>
        <DialogDescription>
          Access applies to this{" "}
          {isDatabase ? "database" : "page and nested pages"}.
        </DialogDescription>
      </DialogHeader>

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
    </DialogContent>
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
