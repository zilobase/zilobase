import {
  createContext,
  useId,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Effect } from "effect";
import { useZilobaseFeatures } from "@zilobase/features";
import { sharedClient } from "@zilobase/features/data";
import { useSharedDataRevision } from "@zilobase/features/data/react";
import {
  useDatabaseRowMoveDestinations,
  useDatabaseRecordActions,
  useDatabaseRecordActionAccess,
  useDatabaseInteractionRecovery,
  type DatabaseRowAction,
} from "@zilobase/features/databases/react";
import {
  Copy,
  ArrowUpRight,
  MessageSquare,
  Link2,
  StarIcon as Star,
  SmilePlus,
  Trash2,
  List,
  FolderInputIcon as FolderInput,
} from "@/components/icons";
import {
  DropDrawer,
  DropDrawerTrigger,
  DropDrawerItem,
  DropDrawerLabel,
  DropDrawerSeparator,
  DropDrawerSub,
  DropDrawerSubTrigger,
  DropDrawerSubContent,
} from "@/components/ui/dropdrawer";
import { DropdownMenuPanelHeader } from "@/components/ui/dropdown-menu";
import { SearchableActionMenuContent } from "@/components/ui/searchable-action-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { IconEmojiPicker } from "@/components/ui/icon-emoji-picker";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  useDatabaseActionsContext,
  useDatabaseDataContext,
  useDatabaseUiContext,
} from "../../state/components/database-view-context";
import { DatabaseSelectionPropertyAction } from "./database-selection-property-action";
import type { useDatabaseSelection } from "../hooks/selection";
import { getDatabasePropertyType } from "../../../properties/lib/property-catalog";

type ActionsContext = {
  open: (element: HTMLElement, rowId?: string) => void;
  trash: () => void;
  canEdit: boolean;
  canTrash: boolean;
  pending: boolean;
};
const RowActionsContext = createContext<ActionsContext | null>(null);
export const useDatabaseRowActions = () => useContext(RowActionsContext);

export function DatabaseRowActionsProvider({
  disabled = false,
  ...props
}: Parameters<typeof DatabaseRecordRowActionsProvider>[0] & { disabled?: boolean }) {
  return disabled ? (
    <RowActionsContext.Provider value={null}>{props.children}</RowActionsContext.Provider>
  ) : (
    <DatabaseRecordRowActionsProvider {...props} />
  );
}

function DatabaseRecordRowActionsProvider({
  children,
  selection,
}: {
  children: ReactNode;
  selection: Pick<
    ReturnType<typeof useDatabaseSelection>,
    | "selectedRows"
    | "selectedRowIds"
    | "setSelectedRowIds"
    | "getSelectionValue"
    | "saveSelectedPropertyValue"
  >;
}) {
  const {
    databaseId,
    hostDatabaseId,
    workspaceId,
    databaseWorkspaceId,
    editable,
    properties,
    personOptions,
    items,
  } = useDatabaseDataContext();
  const { activeView } = useDatabaseUiContext();
  const { onOpenPage, updateDatabasePropertyConfig } = useDatabaseActionsContext();
  const { queryClient } = useZilobaseFeatures();
  const owner = sharedClient(queryClient);
  const authorization = owner.capture();
  useSharedDataRevision(queryClient);
  const scope = [
    authorization.key,
    authorization.epoch,
    databaseId,
    hostDatabaseId,
    activeView?.id,
    editable,
  ].join(":");
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const [anchor, setAnchor] = useState<{
    element: HTMLElement;
    scope: string;
    rowId?: string;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [panel, setPanel] = useState<"icon" | "move" | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const propertyMenuId = useId();
  const [trashOpen, setTrashOpen] = useState(false);
  const [destinationSearch, setDestinationSearch] = useState("");
  const [propertyMode, setPropertyMode] = useState<"match" | "duplicate">("match");
  const anchorElement = useRef<HTMLElement | null>(null);
  const pendingPanel = useRef<{ next: "icon" | "move"; scope: string; selection: string } | null>(
    null,
  );
  const propertyItems = useRef(new Map<string, HTMLDivElement>());
  const previousPropertyId = useRef<string | null>(null);
  const mounted = useRef(false);
  const selectionKey = selection.selectedRows.map((row) => row.id).join(":");
  const currentSelection = useRef(selectionKey);
  currentSelection.current = selectionKey;
  const { pending, run } = useDatabaseRecordActions({
    databaseId: databaseId ?? "",
    hostDatabaseId,
    workspaceId: workspaceId ?? databaseWorkspaceId,
    scope,
    editable,
  });
  const access = useDatabaseRecordActionAccess(
    selection.selectedRows,
    selection.selectedRows.length > 0,
  );
  const recovery = useDatabaseInteractionRecovery();
  const canEdit = editable && access.canEdit && !recovery.hasUnconfirmed;
  const navigation = useDatabaseRowMoveDestinations({
    workspaceId: workspaceId ?? databaseWorkspaceId,
    enabled: panel === "move",
    search: destinationSearch,
    pageIds: selection.selectedRows.map((row) => row.pageId),
    dataSourceId: databaseId,
  });
  const property = properties.find((item) => item.id === propertyId);
  const value = property ? selection.getSelectionValue(property) : null;
  const query = search.trim().toLowerCase();
  const matches = (label: string) => !query || label.toLowerCase().includes(query);
  const editProperties = properties.filter(
    (item) => matches("Edit property") || matches(item.property.name),
  );
  const reason = access.loading
    ? "Checking record access…"
    : recovery.hasUnconfirmed
      ? "Resolve the pending write before making another change"
      : !canEdit
        ? "Every selected record must be editable"
        : undefined;
  const single = selection.selectedRows.length === 1;
  const close = () => {
    setAnchor(null);
    setPropertyId(null);
    setSearch("");
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    close();
    setPanel(null);
    setPropertyId(null);
    setTrashOpen(false);
    selection.setSelectedRowIds(new Set());
  }, [scope]);
  useEffect(() => {
    setPanel(null);
    setPropertyId(null);
    if (!selection.selectedRows.length) {
      close();
      setPanel(null);
      setPropertyId(null);
      setTrashOpen(false);
    }
  }, [selectionKey]);
  useEffect(() => {
    if (!anchor) return;
    const check = () => {
      if (
        !anchor.element.isConnected ||
        (anchor.rowId && !items.some((row) => row.id === anchor.rowId))
      )
        close();
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    const viewport = anchor.element.closest(".database-table-wrap, .database-timeline-view");
    viewport?.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      observer.disconnect();
      viewport?.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [anchor, items]);
  useEffect(() => {
    const previous = previousPropertyId.current;
    previousPropertyId.current = propertyId;
    if (previous && !propertyId) propertyItems.current.get(previous)?.focus();
  }, [propertyId]);
  const open = (element: HTMLElement, rowId?: string) => {
    pendingPanel.current = null;
    if (rowId && !selection.selectedRowIds.has(rowId))
      selection.setSelectedRowIds(new Set([rowId]));
    anchorElement.current = element;
    setPropertyId(null);
    setPanel(null);
    setSearch("");
    setAnchor({ element, scope, rowId });
  };
  const perform = async (action: DatabaseRowAction) => {
    close();
    setPanel(null);
    setTrashOpen(false);
    const started = scope;
    const result = await run(selection.selectedRows, action);
    if (!mounted.current || currentScope.current !== started || result.expired) return;
    if (result.failed.length) {
      selection.setSelectedRowIds(new Set(result.failed.map((item) => item.rowId)));
      toast.error(
        `${result.failed.length} record${result.failed.length === 1 ? "" : "s"} couldn't be updated. ${result.failed[0]?.error.message ?? ""}`,
      );
    } else if (action.type === "duplicate")
      selection.setSelectedRowIds(new Set(result.created.map((row) => row.id)));
    else if (["trash", "movePage", "moveDatabase"].includes(action.type))
      selection.setSelectedRowIds(new Set());
    if (result.succeeded.length)
      toast.success(
        `Updated ${result.succeeded.length} record${result.succeeded.length === 1 ? "" : "s"}`,
      );
  };
  const deferredPanel = (next: "icon" | "move") => {
    pendingPanel.current = { next, scope, selection: selectionKey };
    close();
  };
  const restoreAnchorFocus = () => {
    if (anchorElement.current?.isConnected) anchorElement.current.focus({ preventScroll: true });
  };
  const finishMenuDismissal = () => {
    const requested = pendingPanel.current;
    pendingPanel.current = null;
    if (!requested) {
      restoreAnchorFocus();
      return;
    }
    // Open the picker after the modal menu has released its focus and pointer guards.
    requestAnimationFrame(() => {
      if (
        !mounted.current ||
        currentScope.current !== requested.scope ||
        currentSelection.current !== requested.selection
      )
        return;
      setPanel(requested.next);
    });
  };
  const rect = anchorElement.current?.isConnected
    ? anchorElement.current.getBoundingClientRect()
    : null;
  const hiddenAnchor = (
    <button
      aria-hidden="true"
      tabIndex={-1}
      type="button"
      className="pointer-events-none fixed opacity-0"
      style={{
        left: rect?.left ?? 0,
        top: rect?.top ?? 0,
        width: rect?.width ?? 1,
        height: rect?.height ?? 1,
      }}
    />
  );
  const openRecord = (
    presentation?: "dialog" | "sidepanel" | "fullpage" | "newtab",
    focusComment = false,
  ) => {
    const row = selection.selectedRows[0];
    if (!single || !row) return;
    close();
    onOpenPage?.(row.pageId, { presentation, focusComment, databaseId });
  };
  const candidatePages = navigation.pages;
  const candidateDatabases = navigation.databases;
  return (
    <RowActionsContext.Provider
      value={{
        open,
        canEdit,
        canTrash: canEdit && access.canTrash,
        pending,
        trash: () => setTrashOpen(true),
      }}
    >
      {children}
      <DropDrawer
        open={Boolean(anchor && anchor.scope === scope && selection.selectedRows.length)}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <DropDrawerTrigger asChild>{hiddenAnchor}</DropDrawerTrigger>
        <SearchableActionMenuContent
          search={search}
          onSearchChange={setSearch}
          searchLabel="Search selected row actions"
          side={anchor?.rowId ? "left" : "bottom"}
          sideOffset={8}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            finishMenuDismissal();
          }}
        >
          <DropDrawerLabel>Page</DropDrawerLabel>
          {matches(access.allFavorite ? "Remove from Favorites" : "Add to Favorites") ? (
            <DropDrawerItem
              disabled={!canEdit || pending}
              title={reason}
              onSelect={() => {
                void perform({ type: "favorite", favorite: !access.allFavorite });
              }}
            >
              <Star />
              <span>{access.allFavorite ? "Remove from Favorites" : "Add to Favorites"}</span>
            </DropDrawerItem>
          ) : null}
          {matches("Edit icon") ? (
            <DropDrawerItem
              disabled={!canEdit || pending}
              title={reason}
              onSelect={() => deferredPanel("icon")}
            >
              <SmilePlus />
              <span>Edit icon</span>
            </DropDrawerItem>
          ) : null}
          {editProperties.length ? (
            <DropDrawerSub
              id={propertyMenuId}
              title="Edit property"
              onOpenChange={(next) => {
                if (!next) setPropertyId(null);
              }}
            >
              <DropDrawerSubTrigger disabled={!canEdit || pending} title={reason}>
                <List />
                <span>Edit property</span>
              </DropDrawerSubTrigger>
              <DropDrawerSubContent className={property ? "w-72 p-0" : "w-64"}>
                {property && value ? (
                  <div
                    data-row-property-panel={property.id}
                    onKeyDown={(event) => {
                      if (event.key !== "Escape") event.stopPropagation();
                    }}
                  >
                    <DropdownMenuPanelHeader
                      title={property.property.name}
                      onBack={() => setPropertyId(null)}
                      onClose={close}
                    />
                    <div>
                      <DatabaseSelectionPropertyAction
                        key={property.id}
                        property={property}
                        mixed={value.mixed}
                        value={value.value}
                        personOptions={personOptions}
                        onUpdateConfig={updateDatabasePropertyConfig}
                        onApply={(next) => {
                          if (canEdit) selection.saveSelectedPropertyValue(property, next);
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  editProperties.map((item) => {
                    const kind = getDatabasePropertyType(item.property.type);
                    const Icon = kind.icon;
                    return (
                      <DropDrawerItem
                        key={item.id}
                        ref={(element) => {
                          if (element) propertyItems.current.set(item.id, element);
                          else propertyItems.current.delete(item.id);
                        }}
                        disabled={[
                          "formula",
                          "rollup",
                          "files",
                          "relation",
                          "button",
                          "created_time",
                          "last_edited_time",
                          "created_by",
                          "last_edited_by",
                          "id",
                        ].includes(item.property.type)}
                        onSelect={(event) => {
                          event.preventDefault();
                          setPropertyId(item.id);
                        }}
                      >
                        <Icon />
                        <span>{item.property.name}</span>
                      </DropDrawerItem>
                    );
                  })
                )}
              </DropDrawerSubContent>
            </DropDrawerSub>
          ) : null}
          <DropDrawerSeparator />
          {matches("Open in") ? (
            <DropDrawerSub>
              <DropDrawerSubTrigger
                disabled={!single}
                title={!single ? "Select one record" : undefined}
              >
                <ArrowUpRight />
                <span>Open in</span>
              </DropDrawerSubTrigger>
              <DropDrawerSubContent>
                {(
                  [
                    ["sidepanel", "Side panel"],
                    ["dialog", "Dialog"],
                    ["fullpage", "Full page"],
                    ["newtab", "New tab"],
                  ] as const
                ).map(([mode, label]) => (
                  <DropDrawerItem key={mode} onSelect={() => openRecord(mode)}>
                    {label}
                  </DropDrawerItem>
                ))}
              </DropDrawerSubContent>
            </DropDrawerSub>
          ) : null}
          {matches("Comment") ? (
            <DropDrawerItem
              disabled={!single || !canEdit}
              title={!single ? "Select one record" : undefined}
              onSelect={() => openRecord(undefined, true)}
            >
              <MessageSquare />
              <span>Comment</span>
            </DropDrawerItem>
          ) : null}
          <DropDrawerSeparator />
          {matches("Copy link") ? (
            <DropDrawerItem
              onSelect={() => {
                close();
                void Effect.runPromise(
                  Effect.tryPromise({
                    try: () =>
                      navigator.clipboard.writeText(
                        selection.selectedRows
                          .map((row) => `${window.location.origin}/p/${row.pageId}`)
                          .join("\n"),
                      ),
                    catch: (error) => error,
                  }),
                ).then(
                  () => toast.success("Links copied"),
                  () => toast.error("Couldn't copy links"),
                );
              }}
            >
              <Link2 />
              <span>{single ? "Copy link" : "Copy links to all"}</span>
            </DropDrawerItem>
          ) : null}
          {matches("Duplicate") ? (
            <DropDrawerItem
              disabled={!canEdit || pending}
              title={reason}
              onSelect={() => {
                void perform({ type: "duplicate" });
              }}
            >
              <Copy />
              <span>Duplicate</span>
            </DropDrawerItem>
          ) : null}
          {matches("Move to") ? (
            <DropDrawerItem
              disabled={!canEdit || pending}
              title={reason}
              onSelect={() => deferredPanel("move")}
            >
              <FolderInput />
              <span>Move to</span>
            </DropDrawerItem>
          ) : null}
          {matches("Move to Trash") ? (
            <DropDrawerItem
              disabled={!canEdit || !access.canTrash || pending}
              title={reason}
              variant="destructive"
              onSelect={() => {
                close();
                setTrashOpen(true);
              }}
            >
              <Trash2 />
              <span>Move to Trash</span>
            </DropDrawerItem>
          ) : null}
          {!editProperties.length &&
          ![
            "Add to Favorites",
            "Remove from Favorites",
            "Edit icon",
            "Open in",
            "Comment",
            "Copy link",
            "Duplicate",
            "Move to",
            "Move to Trash",
          ].some(matches) ? (
            <p className="px-2 py-2 text-sm text-content-secondary">No actions found.</p>
          ) : null}
          {access.error ? (
            <p className="px-2 py-1 text-xs text-content-secondary">
              Couldn't check record access.
            </p>
          ) : null}
        </SearchableActionMenuContent>
      </DropDrawer>
      <Popover
        open={panel !== null}
        onOpenChange={(next) => {
          if (!next) setPanel(null);
        }}
      >
        <PopoverTrigger asChild>{hiddenAnchor}</PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-72 p-0"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreAnchorFocus();
          }}
        >
          {panel === "icon" ? (
            <IconEmojiPicker
              onRemove={() => {
                void perform({ type: "icon", icon: null });
              }}
              onEmojiSelect={(icon) => {
                void perform({ type: "icon", icon });
              }}
              onIconSelect={(icon) => {
                void perform({ type: "icon", icon });
              }}
            />
          ) : panel === "move" ? (
            <div className="space-y-2 p-2">
              <Input
                autoFocus
                aria-label="Move records to"
                placeholder="Search pages and databases…"
                value={destinationSearch}
                onChange={(event) => setDestinationSearch(event.target.value)}
              />
              <label className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={propertyMode === "duplicate"}
                  onCheckedChange={(checked) =>
                    setPropertyMode(checked === true ? "duplicate" : "match")
                  }
                />
                Copy unmatched properties to destination databases
              </label>
              <div className="max-h-72 overflow-y-auto" role="group" aria-label="Move destinations">
                {candidatePages.map((page) => (
                  <button
                    type="button"
                    className="flex w-full rounded-sm px-2 py-1 text-left text-sm hover:bg-action-neutral-hover"
                    key={page.id}
                    onClick={() => {
                      void perform({ type: "movePage", pageId: page.id });
                    }}
                  >
                    {page.name || "Untitled"}
                  </button>
                ))}
                {candidateDatabases.map(({ database, source }) => (
                  <button
                    type="button"
                    className="flex w-full rounded-sm px-2 py-1 text-left text-sm hover:bg-action-neutral-hover"
                    key={`${database.id}:${source.id}`}
                    onClick={() => {
                      void perform({
                        type: "moveDatabase",
                        databaseId: database.id,
                        dataSourceId: source.id,
                        propertyMode,
                      });
                    }}
                  >
                    {database.name} / {source.name}
                  </button>
                ))}
                {navigation.isLoading ? <p className="p-2 text-sm">Loading destinations…</p> : null}
                {navigation.isError ? (
                  <button
                    type="button"
                    onClick={() => {
                      void navigation.refetch();
                    }}
                  >
                    Couldn't load destinations. Retry
                  </button>
                ) : null}
                {!navigation.isLoading && !candidatePages.length && !candidateDatabases.length ? (
                  <p className="p-2 text-sm">No destinations found.</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
      <AlertDialog open={trashOpen} onOpenChange={setTrashOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Move {selection.selectedRows.length} record{single ? "" : "s"} to trash?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The selected pages will be moved to trash. You can restore them from Trash.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!canEdit || !access.canTrash || pending}
              onClick={() => {
                void perform({ type: "trash" });
              }}
            >
              Move to Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RowActionsContext.Provider>
  );
}
