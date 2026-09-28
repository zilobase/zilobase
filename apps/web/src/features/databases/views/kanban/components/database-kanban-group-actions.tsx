import { diffConfiguration } from "@zilobase/features/databases/record-interactions";
import { useEffect, useState } from "react";
import { useUpdateDatabaseView } from "@zilobase/features/databases/react";
import { useDeletePage } from "@zilobase/features/pages/react";
import { toast } from "sonner";
import {
  EyeOff,
  MoreHorizontal,
  Plus,
  SlidersHorizontalIcon,
  Trash2,
} from "@/shared/components/icons";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/shared/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/shared/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/shared/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Checkbox } from "@/shared/ui/checkbox";
import {
  useDatabaseActionsContext,
  useDatabaseDataContext,
  useDatabaseUiContext,
} from "../../state/database-view-context";
import { getKanbanGroupValues, type KanbanGroupOption } from "../model/database-kanban-group-model";
import {
  getKanbanGroupSettings,
  updateKanbanGroupSettings,
  getKanbanGroupPageIds,
  type KanbanGroupSettings,
} from "../model/database-kanban-group-settings";

export function useKanbanGroupActions(options: KanbanGroupOption[]) {
  const { activeView } = useDatabaseUiContext();
  const { editable, groupProperty, groupableProperties, items, propertyValuesByKey, hasNextPage } =
    useDatabaseDataContext();
  const { setViewGroupProperty } = useDatabaseActionsContext();
  const updateView = useUpdateDatabaseView();
  const deletePage = useDeletePage();
  const [editing, setEditing] = useState(false);
  const [trashGroup, setTrashGroup] = useState<KanbanGroupOption | null>(null);
  const [trashing, setTrashing] = useState(false);
  useEffect(() => {
    setTrashGroup(null);
  }, [activeView?.id, groupProperty?.property.id]);
  const propertyId = groupProperty?.property.id ?? "";
  const settings = getKanbanGroupSettings(activeView?.config, propertyId);
  const enabled = editable && Boolean(activeView) && !updateView.isPending;
  const save = (patch: Partial<KanbanGroupSettings>) => {
    if (!enabled || !activeView || !propertyId) return;
    updateView.mutate(
      {
        databaseId: activeView.databaseId,
        databaseViewId: activeView.id,
        configuration: diffConfiguration(
          activeView.config,
          updateKanbanGroupSettings(activeView.config, propertyId, patch),
        ),
      },
      { onError: () => toast.error("Couldn't update groups") },
    );
  };
  const setHidden = (id: string, hidden: boolean) =>
    save({
      hiddenGroupIds: hidden
        ? [...new Set([...settings.hiddenGroupIds, id])]
        : settings.hiddenGroupIds.filter((value) => value !== id),
    });
  const toggleCount = (id: string) =>
    save({
      hiddenCountGroupIds: settings.hiddenCountGroupIds.includes(id)
        ? settings.hiddenCountGroupIds.filter((value) => value !== id)
        : [...settings.hiddenCountGroupIds, id],
    });
  const trash = async () => {
    if (!editable || !groupProperty || !trashGroup || trashing || hasNextPage) return;
    const pageIds = getKanbanGroupPageIds(items, trashGroup.groupValue, (row) =>
      getKanbanGroupValues({ row, property: groupProperty, propertyValuesByKey }),
    );
    setTrashing(true);
    try {
      // Each page goes through the shared recoverable deletion and cache flow.
      const failed = await deleteGroupPages(pageIds, deletePage.mutateAsync);
      if (failed)
        toast.error(
          `${failed} page${failed === 1 ? "" : "s"} couldn't be moved to Trash. You can retry.`,
        );
      else {
        setTrashGroup(null);
        toast.success("Pages moved to Trash");
      }
    } finally {
      setTrashing(false);
    }
  };
  return {
    settings,
    enabled,
    editable,
    options,
    groupProperty,
    groupableProperties,
    setViewGroupProperty,
    editing,
    setEditing,
    setHidden,
    toggleCount,
    trashGroup,
    setTrashGroup,
    trashing,
    trash,
    hasNextPage,
  };
}

type GroupActions = ReturnType<typeof useKanbanGroupActions>;

export function DatabaseKanbanGroupActions({
  option,
  actions,
  onAdd,
  canAdd,
  adding,
}: {
  option: KanbanGroupOption;
  actions: GroupActions;
  onAdd: () => void;
  canAdd: boolean;
  adding: boolean;
}) {
  if (!actions.editable) return null;
  return (
    <div className="ml-auto flex shrink-0 items-center gap-0.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button aria-label={`${option.name} group actions`} variant="ghost" size="icon-sm">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => actions.setEditing(true)}>
            <SlidersHorizontalIcon />
            Edit groups
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!actions.enabled}
            onSelect={() => actions.toggleCount(option.id)}
          >
            <EyeOff />
            {actions.settings.hiddenCountGroupIds.includes(option.id)
              ? "Show aggregation"
              : "Hide aggregation"}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!actions.enabled}
            onSelect={() => actions.setHidden(option.id, true)}
          >
            <EyeOff />
            Hide group
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={actions.trashing || actions.hasNextPage}
            onSelect={() => actions.setTrashGroup(option)}
          >
            <Trash2 />
            Move to Trash
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {canAdd ? (
        <Button
          aria-label={`New page in ${option.name}`}
          disabled={adding}
          onClick={onAdd}
          variant="ghost"
          size="icon-sm"
        >
          <Plus />
        </Button>
      ) : null}
    </div>
  );
}

export function DatabaseKanbanGroupDialogs({ actions }: { actions: GroupActions }) {
  return (
    <>
      <Dialog open={actions.editing} onOpenChange={actions.setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit groups</DialogTitle>
            <DialogDescription>
              Choose how to group pages and which columns to show.
            </DialogDescription>
          </DialogHeader>
          <Select
            value={actions.groupProperty?.property.id}
            onValueChange={actions.setViewGroupProperty}
            disabled={!actions.enabled}
          >
            <SelectTrigger aria-label="Group by">
              <SelectValue placeholder="Group by" />
            </SelectTrigger>
            <SelectContent>
              {actions.groupableProperties.map((property) => (
                <SelectItem key={property.id} value={property.property.id}>
                  {property.property.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="max-h-72 overflow-y-auto">
            {actions.options.map((option) => (
              <label
                key={option.id}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm"
              >
                <Checkbox
                  checked={!actions.settings.hiddenGroupIds.includes(option.id)}
                  disabled={!actions.enabled}
                  onCheckedChange={(checked) => actions.setHidden(option.id, checked !== true)}
                />
                <span>{option.name}</span>
              </label>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={actions.trashGroup !== null}
        onOpenChange={(open) => {
          if (!open && !actions.trashing) actions.setTrashGroup(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              All pages inside this group will be moved to Trash.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actions.trashing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={actions.trashing || !actions.editable || actions.hasNextPage}
              onClick={(event) => {
                event.preventDefault();
                void actions.trash();
              }}
            >
              {actions.trashing ? "Moving to Trash…" : "Move to Trash"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

async function deleteGroupPages(pageIds: string[], remove: (id: string) => Promise<unknown>) {
  let failed = 0;
  for (const id of pageIds) {
    try {
      await remove(id);
    } catch {
      failed++;
    }
  }
  return failed;
}
