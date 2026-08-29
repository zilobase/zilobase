import {
  ArrowDownUp,
  ArrowLeftToLine,
  ArrowRightToLine,
  Check,
  ChevronDown,
  ChevronsUpDown,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Filter,
  GripVertical,
  PlayCircle,
  Plus,
  Settings2,
  Sigma,
  Sparkles,
  TextWrap,
  Trash2,
  X,
} from "@/shared/components/icons";
import { useState, type ButtonHTMLAttributes } from "react";

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
import { Button } from "@/shared/ui/button";
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerItem,
  DropDrawerSeparator,
  DropDrawerSub,
  DropDrawerSubContent,
  DropDrawerSubTrigger,
  DropDrawerTrigger,
} from "@/shared/ui/dropdrawer";
import { Input } from "@/shared/ui/input";
import { IconEmojiPicker } from "@/shared/ui/icon-emoji-picker";
import { PageIconDisplay } from "@/features/pages/index";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/shared/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  useDatabase,
  useDeleteDatabaseProperty,
  useDuplicateDatabaseProperty,
  useUpdateDatabase,
  useUpdateDatabaseProperty,
} from "@zilobase/features/databases";
import { Separator } from "@/shared/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/app-tabs";
import { Textarea } from "@/shared/ui/textarea";

import {
  databasePropertyTypes,
  getDatabasePropertyType,
} from "../../core/database-property-types";
import {
  getDatabaseSorts,
  getDatabasePropertyIcon,
  getMergedDatabaseConfig,
  getMergedPropertyConfig,
  getPropertyWrapContent,
  upsertDatabaseSort,
  type DatabasePropertyConfig,
  type DatabaseSortDirection,
} from "../../views/model/database-view-config";
import { DatabasePropertyEditSubmenu } from "../configuration";
import { useClearDatabasePropertyDrafts } from "../../views/model/database-cell-state";

export { DatabaseNamePropertyMenu } from "./database-name-property-menu";
export { DatabasePropertyEditSubmenu } from "../configuration";

export function DatabasePropertyMenu({
  config,
  databaseConfig,
  databaseId,
  databasePropertyId,
  name,
  onOpenChange,
  onInsertProperty,
  onEditFormula,
  onRename,
  onSort,
  open,
  onToggleGroup,
  onUpdateConfig,
  triggerDragProps,
  isGrouped = false,
  schemaActionsEnabled = true,
  sortDirection,
  sourceDatabaseId,
  sourceDatabaseName,
  sourcePropertyId,
  type,
  wrapContent: controlledWrapContent,
  workspaceId,
}: {
  config?: unknown;
  databaseConfig?: unknown;
  databaseId: string;
  databasePropertyId: string;
  isGrouped?: boolean;
  name: string;
  onOpenChange?: (open: boolean) => void;
  onInsertProperty: (side: "left" | "right") => void;
  onEditFormula?: () => void;
  onRename: (name: string) => void;
  onSort?: (direction: DatabaseSortDirection) => void;
  onToggleGroup?: () => void;
  onUpdateConfig?: (config: DatabasePropertyConfig) => void;
  open?: boolean;
  schemaActionsEnabled?: boolean;
  sortDirection?: DatabaseSortDirection;
  sourceDatabaseId?: string;
  sourceDatabaseName?: string;
  sourcePropertyId?: string;
  type: string;
  wrapContent?: boolean;
  triggerDragProps?: Pick<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "onClick" | "onPointerDownCapture" | "title"
  >;
  workspaceId?: string | null;
}) {
  const [automationDialogOpen, setAutomationDialogOpen] = useState(false);
  const [basicAutofillDialogOpen, setBasicAutofillDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [relationDeleteMode, setRelationDeleteMode] = useState<
    "this" | "related"
  >("this");
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const updateDatabase = useUpdateDatabase();
  const updateProperty = useUpdateDatabaseProperty();
  const deleteProperty = useDeleteDatabaseProperty();
  const duplicateProperty = useDuplicateDatabaseProperty();
  const clearPropertyDrafts = useClearDatabasePropertyDrafts();
  const propertyType = getDatabasePropertyType(type);
  const PropertyIcon = propertyType.icon;
  const customIcon = getDatabasePropertyIcon(config);
  const currentSorts = getDatabaseSorts(databaseConfig);
  const currentSortDirection =
    sortDirection ??
    currentSorts.find((sort) => sort.column === databasePropertyId)?.direction;
  const isButtonProperty = type === "button";
  const isFormulaProperty = type === "formula";
  const hidesEditProperty =
    type === "text" ||
    type === "checkbox" ||
    type === "email" ||
    type === "phone";
  const canBasicAutofill =
    type === "text" || type === "select" || type === "multi_select";
  const relationDeleteConfig = getRelationDeleteConfig(config);
  const { data: relatedDatabasePayload } = useDatabase(
    type === "relation" ? relationDeleteConfig.relatedDatabaseId : null,
    { schemaOnly: true },
  );
  const relatedDatabaseProperty = relatedDatabasePayload?.properties.find(
    (property) =>
      property.property.id === relationDeleteConfig.relatedPropertyId,
  );
  const wrapContent = controlledWrapContent ?? getPropertyWrapContent(config);
  const updatePropertyConfig = (nextConfig: DatabasePropertyConfig) => {
    if (onUpdateConfig) {
      onUpdateConfig(nextConfig);
      return;
    }

    updateProperty.mutate({
      config: getMergedPropertyConfig(config, nextConfig),
      databaseId,
      databasePropertyId,
    });
  };
  const updateSort = (direction: DatabaseSortDirection) => {
    if (onSort) {
      onSort(direction);
      return;
    }

    updateDatabase.mutate({
      config: getMergedDatabaseConfig(databaseConfig, {
        sorts: upsertDatabaseSort(currentSorts, {
          column: databasePropertyId,
          direction,
        }),
      }),
      databaseId,
    });
  };
  const duplicateDatabaseProperty = (includeValues: boolean) => {
    duplicateProperty.mutate({
      databaseId,
      databasePropertyId,
      includeValues,
    });
  };
  const deleteDatabaseProperty = () => {
    deleteProperty.mutate({
      databaseId,
      databasePropertyId,
    });
  };
  const deleteRelationProperties = (includeRelated: boolean) => {
    if (includeRelated && relatedDatabaseProperty) {
      deleteProperty.mutate({
        databaseId: relationDeleteConfig.relatedDatabaseId!,
        databasePropertyId: relatedDatabaseProperty.id,
      });
    }

    deleteDatabaseProperty();
  };
  const changePropertyType = (nextType: string) => {
    if (nextType === type) {
      return;
    }

    if (sourcePropertyId) {
      clearPropertyDrafts(sourcePropertyId);
    }

    updateProperty.mutate({
      databaseId,
      databasePropertyId,
      type: nextType,
    });
  };

  const renderPropertyIcon = () =>
    customIcon ? (
      <PageIconDisplay size="sm" value={customIcon} />
    ) : (
      <PropertyIcon className="size-4 shrink-0 text-content-secondary" />
    );

  return (
    <>
      <DropDrawer open={open} onOpenChange={onOpenChange}>
        <DropDrawerTrigger asChild>
          <button
            aria-label={`${name} property options`}
            className="database-property-menu-trigger group flex h-8 w-full min-w-0 items-stretch gap-2 px-3 py-1 text-left text-sm font-medium text-content-secondary transition-colors hover:text-content-primary focus-visible:text-content-primary focus-visible:ring-2 focus-visible:ring-action-focus-ring focus-visible:outline-none data-[state=open]:text-content-primary [&_svg]:size-4 [&_svg]:shrink-0"
            type="button"
            {...triggerDragProps}
          >
            <span className="self-center">{renderPropertyIcon()}</span>
            <span className="flex min-w-0 items-center truncate">{name}</span>
            <ChevronDown className="ml-auto self-center opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        </DropDrawerTrigger>
        <DropDrawerContent
          className="w-72"
          onCloseAutoFocus={(event) => event.preventDefault()}
          sideOffset={0}
        >
          <div className="flex items-center gap-1.5 p-1.5">
            <Popover open={iconPickerOpen} onOpenChange={setIconPickerOpen}>
              <div className="group/property-icon relative shrink-0">
                <PopoverTrigger asChild>
                  <button
                    aria-label="Change property icon"
                    className="flex size-8 items-center justify-center rounded-md border bg-surface-canvas transition-colors hover:bg-action-neutral-hover focus-visible:ring-2 focus-visible:ring-action-focus-ring focus-visible:outline-none"
                    type="button"
                  >
                    {renderPropertyIcon()}
                  </button>
                </PopoverTrigger>
                {customIcon ? (
                  <button
                    aria-label="Reset property icon"
                    className="absolute -right-1 -top-1 hidden size-4 items-center justify-center rounded-full border bg-surface-canvas text-content-secondary shadow-sm hover:bg-action-neutral-hover hover:text-action-on-neutral active:bg-action-neutral-pressed active:text-action-on-neutral group-focus-within/property-icon:flex group-hover/property-icon:flex [&_svg]:size-2.5"
                    onClick={() => updatePropertyConfig({ icon: "" })}
                    type="button"
                  >
                    <X />
                  </button>
                ) : null}
              </div>
              <PopoverContent
                align="start"
                className="w-auto gap-0 overflow-hidden p-0"
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                sideOffset={6}
              >
                <IconEmojiPicker
                  onEmojiSelect={(icon) => {
                    updatePropertyConfig({ icon });
                    setIconPickerOpen(false);
                  }}
                  onIconSelect={(icon) => {
                    updatePropertyConfig({ icon });
                    setIconPickerOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
            <Input
              aria-label="Property name"
              className="h-8 min-w-0 flex-1 text-sm font-medium"
              defaultValue={name}
              onBlur={(event) => {
                const nextName = event.target.value.trim();

                if (nextName !== name) {
                  onRename(nextName);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
            />
          </div>
          <DropDrawerSeparator />
          {isButtonProperty && schemaActionsEnabled ? (
            <DropDrawerItem onSelect={() => setAutomationDialogOpen(true)}>
              <Sparkles />
              <span>Edit automation</span>
            </DropDrawerItem>
          ) : isFormulaProperty && schemaActionsEnabled ? (
            <DropDrawerItem
              disabled={!onEditFormula}
              onSelect={() => onEditFormula?.()}
            >
              <Sigma />
              <span>Edit formula</span>
            </DropDrawerItem>
          ) : schemaActionsEnabled && !hidesEditProperty ? (
            <DatabasePropertyEditSubmenu
              config={config}
              databaseId={databaseId}
              databasePropertyId={databasePropertyId}
              sourceDatabaseId={sourceDatabaseId}
              sourceDatabaseName={sourceDatabaseName}
              sourcePropertyId={sourcePropertyId}
              type={type}
              workspaceId={workspaceId}
            >
              <Settings2 />
              <span>Edit property</span>
            </DatabasePropertyEditSubmenu>
          ) : null}
          <DropDrawerItem
            aria-pressed={wrapContent}
            onSelect={(event) => {
              event.preventDefault();
              updatePropertyConfig({ wrapContent: !wrapContent });
            }}
          >
            <TextWrap />
            <span>{wrapContent ? "Unwrap content" : "Wrap content"}</span>
          </DropDrawerItem>
          {schemaActionsEnabled ? (
            <DropDrawerSub>
              <DropDrawerSubTrigger>
                <ChevronsUpDown />
                <span>Change type</span>
              </DropDrawerSubTrigger>
              <DropDrawerSubContent className="w-64">
                {databasePropertyTypes.map((group, groupIndex) => (
                  <div key={groupIndex}>
                    {groupIndex > 0 ? <DropDrawerSeparator /> : null}
                    {group.map((nextPropertyType) => {
                      const TypeIcon = nextPropertyType.icon;
                      const isActive = nextPropertyType.type === type;

                      return (
                        <DropDrawerItem
                          key={nextPropertyType.type}
                          onSelect={() =>
                            changePropertyType(nextPropertyType.type)
                          }
                        >
                          <TypeIcon />
                          <span>{nextPropertyType.label}</span>
                          {isActive ? <Check className="ml-auto" /> : null}
                        </DropDrawerItem>
                      );
                    })}
                  </div>
                ))}
              </DropDrawerSubContent>
            </DropDrawerSub>
          ) : null}
          {canBasicAutofill && schemaActionsEnabled ? (
            <DropDrawerSub>
              <DropDrawerSubTrigger>
                <Sparkles />
                <span>AI Autofill</span>
              </DropDrawerSubTrigger>
              <DropDrawerSubContent>
                <DropDrawerItem
                  onSelect={() => setBasicAutofillDialogOpen(true)}
                >
                  Basic Autofill
                </DropDrawerItem>
                <DropDrawerItem disabled>Agent Autofill</DropDrawerItem>
              </DropDrawerSubContent>
            </DropDrawerSub>
          ) : null}
          <DropDrawerSeparator />
          <DropDrawerItem disabled>
            <Filter />
            <span>Filter</span>
          </DropDrawerItem>
          <DropDrawerItem
            onSelect={(event) => {
              event.preventDefault();
              onToggleGroup?.();
            }}
          >
            <GripVertical />
            <span>{isGrouped ? "Ungroup" : "Group"}</span>
          </DropDrawerItem>
          <DropDrawerSub>
            <DropDrawerSubTrigger>
              <ArrowDownUp />
              <span>Sort</span>
            </DropDrawerSubTrigger>
            <DropDrawerSubContent>
              <DropDrawerItem
                onSelect={(event) => {
                  event.preventDefault();
                  updateSort("ascending");
                }}
              >
                <span>Ascending</span>
                {currentSortDirection === "ascending" ? (
                  <Check className="ml-auto" />
                ) : null}
              </DropDrawerItem>
              <DropDrawerItem
                onSelect={(event) => {
                  event.preventDefault();
                  updateSort("descending");
                }}
              >
                <span>Descending</span>
                {currentSortDirection === "descending" ? (
                  <Check className="ml-auto" />
                ) : null}
              </DropDrawerItem>
            </DropDrawerSubContent>
          </DropDrawerSub>
          <DropDrawerItem
            onSelect={() => updatePropertyConfig({ hidden: true })}
          >
            <EyeOff />
            <span>Hide</span>
          </DropDrawerItem>
          {schemaActionsEnabled ? (
            <>
              <DropDrawerSeparator />
              <DropDrawerItem onSelect={() => onInsertProperty("left")}>
                <ArrowLeftToLine />
                <span>Insert left</span>
              </DropDrawerItem>
              <DropDrawerItem onSelect={() => onInsertProperty("right")}>
                <ArrowRightToLine />
                <span>Insert right</span>
              </DropDrawerItem>
              <DropDrawerItem
                disabled={duplicateProperty.isPending}
                onSelect={() => setDuplicateDialogOpen(true)}
              >
                <Copy />
                <span>Duplicate property</span>
              </DropDrawerItem>
              <DropDrawerItem
                disabled={deleteProperty.isPending}
                onSelect={() =>
                  type === "relation"
                    ? setDeleteDialogOpen(true)
                    : deleteDatabaseProperty()
                }
                variant="destructive"
              >
                <Trash2 />
                <span>Delete property</span>
              </DropDrawerItem>
            </>
          ) : null}
        </DropDrawerContent>
      </DropDrawer>
      <AlertDialog
        open={duplicateDialogOpen}
        onOpenChange={setDuplicateDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate property?</AlertDialogTitle>
            <AlertDialogDescription>
              Choose whether to copy only the property setup or also duplicate
              its existing values.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => duplicateDatabaseProperty(false)}>
              Property only
            </AlertDialogAction>
            <AlertDialogAction onClick={() => duplicateDatabaseProperty(true)}>
              Property + values
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete relation property?</AlertDialogTitle>
            <AlertDialogDescription>
              Choose what should happen to the related property.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <RadioGroup
            className="grid gap-2"
            onValueChange={(value) =>
              setRelationDeleteMode(value === "related" ? "related" : "this")
            }
            value={relationDeleteMode}
          >
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-left hover:bg-action-neutral-hover has-[[data-state=checked]]:border-action-selected-border has-[[data-state=checked]]:bg-action-neutral-hover">
              <RadioGroupItem className="mt-0.5" value="this" />
              <span className="grid gap-1">
                <span className="text-sm font-medium">
                  Delete this property only
                </span>
                <span className="text-xs text-content-secondary">
                  Keep the related property in the connected database.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-left hover:bg-action-neutral-hover has-[[data-state=checked]]:border-action-selected-border has-[[data-state=checked]]:bg-action-neutral-hover has-[[data-disabled]]:cursor-not-allowed has-[[data-disabled]]:opacity-50">
              <RadioGroupItem
                className="mt-0.5"
                disabled={!relatedDatabaseProperty}
                value="related"
              />
              <span className="grid gap-1">
                <span className="text-sm font-medium">
                  Also delete related property
                </span>
                <span className="text-xs text-content-secondary">
                  Remove the matching relation property from the connected
                  database too.
                </span>
              </span>
            </label>
          </RadioGroup>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteRelationProperties(relationDeleteMode === "related")
              }
              variant="destructive"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={automationDialogOpen}
        onOpenChange={setAutomationDialogOpen}
      >
        <DialogContent className="sm:max-w-xl">
          <ButtonAutomationDialog propertyName={name} />
        </DialogContent>
      </Dialog>
      <Dialog
        open={basicAutofillDialogOpen}
        onOpenChange={setBasicAutofillDialogOpen}
      >
        <DialogContent className="sm:max-w-5xl">
          <BasicAutofillDialog propertyName={name} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function getRelationDeleteConfig(config: unknown) {
  const relation =
    config && typeof config === "object" && !Array.isArray(config)
      ? (config as { relation?: unknown }).relation
      : null;

  if (!relation || typeof relation !== "object" || Array.isArray(relation)) {
    return {};
  }

  const relationConfig = relation as {
    relatedDatabaseId?: unknown;
    relatedPropertyId?: unknown;
  };

  return {
    relatedDatabaseId:
      typeof relationConfig.relatedDatabaseId === "string"
        ? relationConfig.relatedDatabaseId
        : undefined,
    relatedPropertyId:
      typeof relationConfig.relatedPropertyId === "string"
        ? relationConfig.relatedPropertyId
        : undefined,
  };
}

function ButtonAutomationDialog({ propertyName }: { propertyName: string }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{propertyName}</DialogTitle>
        <DialogDescription>
          Configure what happens when this button is clicked.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-6">
        <section className="grid gap-2">
          <div className="text-sm font-medium text-content-secondary">When</div>
          <Button className="w-full" type="button" variant="outline">
            <Sparkles className="size-5 shrink-0 text-content-secondary" />
            <span className="font-medium text-content-primary">
              Button is clicked
            </span>
          </Button>
        </section>
        <div className="flex justify-center">
          <div className="h-10 w-px bg-stroke-default" />
        </div>
        <section className="grid gap-2">
          <div className="text-sm font-medium text-content-secondary">Do</div>
          <Button className="w-full" type="button" variant="outline">
            <Plus className="size-5 shrink-0" />
            <span>New action</span>
          </Button>
        </section>
      </div>
      <DialogFooter>
        <Button type="button">Save</Button>
      </DialogFooter>
    </>
  );
}

function BasicAutofillDialog({ propertyName }: { propertyName: string }) {
  return (
    <>
      <div className="grid min-h-[28rem] gap-4 md:grid-cols-[minmax(0,1fr)_1px_minmax(18rem,0.95fr)] md:grid-rows-[auto_minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-content-secondary" />
            <span>Autofill {propertyName}</span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Configure basic autofill for {propertyName}.
          </DialogDescription>
        </DialogHeader>

        <Separator
          className="hidden md:row-span-2 md:block"
          orientation="vertical"
        />

        <div className="flex items-center gap-2 text-sm font-medium text-content-secondary">
          <span>Preview with</span>
          <Button className="min-w-0" size="sm" type="button" variant="ghost">
            <FileText className="size-4" />
            <span className="truncate">{propertyName}</span>
            <ChevronDown className="size-4" />
          </Button>
        </div>

        <section className="grid content-start gap-5">
          <Tabs className="gap-4" defaultValue="basic">
            <TabsList className="w-full">
              <TabsTrigger className="flex-1" value="basic">
                <Sparkles />
                Basic
              </TabsTrigger>
              <TabsTrigger className="flex-1" disabled value="agent">
                Custom Agent
              </TabsTrigger>
            </TabsList>
            <TabsContent className="grid gap-5" value="basic">
              <div className="grid gap-2">
                <div className="text-sm font-medium text-content-secondary">
                  Suggested
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary">
                    Translate
                    <ChevronDown className="size-4" />
                  </Button>
                  <Button type="button" variant="secondary">
                    Summarize
                    <ChevronDown className="size-4" />
                  </Button>
                </div>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-content-secondary">
                  Instructions
                </span>
                <Textarea
                  className="min-h-40 resize-none"
                  placeholder="How would you like to autofill this property?"
                />
              </label>

              <div className="grid gap-3">
                <div className="text-sm font-medium text-content-secondary">
                  Triggers
                </div>
                <button
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm text-content-secondary transition-colors hover:bg-action-neutral-hover hover:text-action-on-neutral active:bg-action-neutral-pressed active:text-action-on-neutral"
                  type="button"
                >
                  <span>On page creation</span>
                  <span className="flex items-center gap-1">
                    None
                    <ChevronDown className="-rotate-90 size-4" />
                  </span>
                </button>
                <button
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm text-content-secondary transition-colors hover:bg-action-neutral-hover hover:text-action-on-neutral active:bg-action-neutral-pressed active:text-action-on-neutral"
                  type="button"
                >
                  <span>On page update</span>
                  <span className="flex items-center gap-1">
                    None
                    <ChevronDown className="-rotate-90 size-4" />
                  </span>
                </button>
              </div>
            </TabsContent>
            <TabsContent value="agent" />
          </Tabs>
        </section>

        <section className="flex min-h-0 flex-col border-t md:border-t-0">
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center text-content-secondary">
            <Eye className="size-8" />
            <div className="text-sm font-medium">Preview with real data</div>
            <Button disabled type="button" variant="outline">
              Generate
            </Button>
          </div>
        </section>
      </div>

      <DialogFooter>
        <Button type="button">Save changes</Button>
        <Button disabled type="button" variant="outline">
          <PlayCircle className="size-4" />
          Run AI Autofill now
        </Button>
      </DialogFooter>
    </>
  );
}
