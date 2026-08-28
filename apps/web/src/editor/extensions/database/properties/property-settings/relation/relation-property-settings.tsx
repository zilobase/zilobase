import {
  ArrowUpRight,
  ChevronLeft,
  CircleHelp,
  Database,
  Hash,
  Plus,
  Search,
} from "@/components/icons";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

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
import { Button } from "@/components/ui/button";
import {
  DropDrawerItem,
  DropDrawerSeparator,
} from "@/components/ui/dropdrawer";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useAddDatabaseProperty,
  useDatabase,
  useUpdateDatabaseProperty,
  useUpdateDatabasePropertyValue,
} from "@zilobase/features/databases";
import { usePageNavigation } from "@zilobase/features/pages";

import {
  DatabaseSearchableMenuItems,
  type DatabaseSearchableMenuOption,
} from "../../../views/database-searchable-menu-items";
import type { DatabasePropertyConfig } from "../../../views/database-view-config";
import {
  getRelationNeedsRepair,
  getRelationRepairMutationPlan,
  getRelationTwoWayConfigUpdate,
} from "../../database-relation-sync";

type RelationDatabaseOption = DatabaseSearchableMenuOption & {
  pageName: string;
};

export function RelationPropertySettings({
  config,
  databaseId,
  databasePropertyId,
  onUpdateConfig,
  sourceDatabaseId,
  sourceDatabaseName,
  sourcePropertyId,
  workspaceId,
}: {
  config?: unknown;
  databaseId: string;
  databasePropertyId: string;
  onUpdateConfig: (config: DatabasePropertyConfig) => void;
  sourceDatabaseId: string;
  sourceDatabaseName?: string;
  sourcePropertyId?: string;
  workspaceId?: string | null;
}) {
  const navigate = useNavigate();
  const relationConfig = getRelationConfig(config);
  const addProperty = useAddDatabaseProperty();
  const updateProperty = useUpdateDatabaseProperty();
  const updateValue = useUpdateDatabasePropertyValue();
  const [repairDialogOpen, setRepairDialogOpen] = useState(false);
  const [repairPrimarySource, setRepairPrimarySource] = useState<
    "source" | "related"
  >("source");
  const [optimisticTwoWayRelation, setOptimisticTwoWayRelation] = useState<
    boolean | null
  >(null);
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string | null>(
    relationConfig.relatedDatabaseId ?? null,
  );
  const [relatedPropertyName, setRelatedPropertyName] = useState(
    relationConfig.relatedPropertyName ?? "",
  );
  const { data: navigation, isLoading } = usePageNavigation(workspaceId, {
    enabled: Boolean(workspaceId),
  });
  const { data: relatedDatabaseSchema } = useDatabase(selectedDatabaseId, {
    schemaOnly: true,
  });
  const pagesById = new Map(
    (navigation?.pages ?? []).map((page) => [page.id, page]),
  );
  const databaseOptions = (navigation?.databases ?? [])
    .filter((database) => database.id !== sourceDatabaseId)
    .map<RelationDatabaseOption>((database) => {
      const pageName = database.pageId
        ? pagesById.get(database.pageId)?.name || "Untitled"
        : "Standalone";

      return {
        icon: <Database />,
        label: database.name || "Untitled database",
        pageName,
        searchText: `${database.name} ${pageName}`.trim(),
        value: database.id,
      };
    });
  const selectedDatabase = selectedDatabaseId
    ? databaseOptions.find((option) => option.value === selectedDatabaseId)
    : null;
  const limit = relationConfig.limit ?? "no_limit";
  const twoWayRelation =
    optimisticTwoWayRelation ?? relationConfig.twoWayRelation ?? false;
  const relationCreated =
    relationConfig.relatedDatabaseId === selectedDatabaseId;
  const needsRepair = getRelationNeedsRepair({
    propertyConfig: config,
    relatedDatabasePayload: relatedDatabaseSchema,
  });
  const { data: currentDatabasePayload } = useDatabase(sourceDatabaseId, {
    schemaOnly: !needsRepair,
  });
  const { data: relatedDatabasePayload } = useDatabase(selectedDatabaseId, {
    schemaOnly: !needsRepair,
  });

  useEffect(() => {
    setOptimisticTwoWayRelation(null);
  }, [relationConfig.twoWayRelation]);

  const repairRelations = () => {
    const repairPlan = getRelationRepairMutationPlan({
      databaseId,
      databasePropertyId,
      payload: currentDatabasePayload,
      primarySource: repairPrimarySource,
      propertyConfig: config,
      relatedDatabasePayload,
    });

    if (!repairPlan) {
      return;
    }

    repairPlan.valueUpdates.forEach((update) => {
      updateValue.mutate({
        databaseId: update.databaseId,
        propertyId: update.propertyId,
        rowId: update.rowId,
        value: update.value,
      });
    });
    repairPlan.configUpdates.forEach((update) => updateProperty.mutate(update));
    setRepairDialogOpen(false);
  };
  const saveRelation = () => {
    if (!selectedDatabase) {
      return;
    }

    const nextRelation = {
      ...relationConfig,
      relatedDatabaseId: selectedDatabase.value,
      relatedDatabaseName: selectedDatabase.label,
      relatedPageName: selectedDatabase.pageName,
      relatedPropertyName: relatedPropertyName.trim() || undefined,
      twoWayRelation,
    };

    if (!twoWayRelation || !relatedPropertyName.trim() || !sourcePropertyId) {
      onUpdateConfig({ relation: nextRelation });
      return;
    }

    addProperty.mutate(
      {
        config: {
          relation: {
            limit,
            relatedDatabaseId: sourceDatabaseId,
            relatedDatabaseName: sourceDatabaseName,
            relatedPropertyId: sourcePropertyId,
            twoWayRelation: true,
          },
        },
        databaseId: selectedDatabase.value,
        name: relatedPropertyName.trim(),
        type: "relation",
      },
      {
        onSuccess: (payload) => {
          const reciprocalProperty = payload.properties
            .filter(
              (property) =>
                property.property.type === "relation" &&
                property.property.name === relatedPropertyName.trim(),
            )
            .at(-1);

          onUpdateConfig({
            relation: {
              ...nextRelation,
              relatedPropertyId: reciprocalProperty?.property.id,
            },
          });
        },
      },
    );
  };

  if (selectedDatabase) {
    return (
      <>
        <DropDrawerItem
          onSelect={(event) => {
            event.preventDefault();
            setSelectedDatabaseId(null);
          }}
        >
          <ChevronLeft />
          <span>Back</span>
        </DropDrawerItem>
        <DropDrawerSeparator />
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <DropDrawerItem
                className="text-muted-foreground"
                onSelect={() =>
                  void navigate({
                    params: { databaseId: selectedDatabase.value },
                    search: { view: undefined },
                    to: "/d/$databaseId",
                  })
                }
              >
                <Database />
                <span>Related to</span>
                <span className="ml-auto max-w-36 truncate text-muted-foreground">
                  {selectedDatabase.label}
                </span>
              </DropDrawerItem>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            A related database cannot be changed after creation
          </TooltipContent>
        </Tooltip>
        <DropDrawerItem
          onSelect={(event) => {
            event.preventDefault();
            onUpdateConfig({
              relation: {
                ...relationConfig,
                limit: limit === "no_limit" ? "one_page" : "no_limit",
              },
            });
          }}
        >
          <Hash />
          <span>Limit</span>
          <span className="ml-auto text-muted-foreground">
            {limit === "one_page" ? "1 page" : "No limit"}
          </span>
        </DropDrawerItem>
        <DropDrawerItem
          aria-pressed={twoWayRelation}
          onSelect={(event) => {
            event.preventDefault();
            const nextTwoWayRelation = !twoWayRelation;
            setOptimisticTwoWayRelation(nextTwoWayRelation);
            const relatedConfigUpdate = getRelationTwoWayConfigUpdate({
              nextTwoWayRelation,
              propertyConfig: config,
              relatedDatabasePayload: relatedDatabaseSchema,
            });

            if (relatedConfigUpdate) {
              updateProperty.mutate(relatedConfigUpdate);
            }

            onUpdateConfig({
              relation: {
                ...relationConfig,
                relatedPropertyName: relatedPropertyName.trim() || undefined,
                twoWayRelation: nextTwoWayRelation,
              },
            });

            if (nextTwoWayRelation && needsRepair) {
              setRepairDialogOpen(true);
            }
          }}
        >
          <ArrowUpRight />
          <span>Two-way relation</span>
          <Switch
            checked={twoWayRelation}
            className="ml-auto pointer-events-none"
            size="sm"
            tabIndex={-1}
          />
        </DropDrawerItem>
        {twoWayRelation && relationCreated && needsRepair ? (
          <div className="px-2 py-1.5">
            <Button
              className="w-full"
              onClick={() => setRepairDialogOpen(true)}
              size="sm"
              type="button"
              variant="secondary"
            >
              Repair relations
            </Button>
          </div>
        ) : null}
        {twoWayRelation && !relationCreated ? (
          <div className="px-2 py-1.5">
            <Input
              aria-label="Related property name"
              className="h-8"
              onChange={(event) => setRelatedPropertyName(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder="Related property name"
              value={relatedPropertyName}
            />
          </div>
        ) : null}
        {!relationCreated ? (
          <div className="px-2 py-1.5">
            <Button
              className="w-full"
              disabled={
                addProperty.isPending ||
                (twoWayRelation &&
                  (!relatedPropertyName.trim() || !sourcePropertyId))
              }
              onClick={saveRelation}
              size="sm"
              type="button"
            >
              <Plus />
              <span>
                {addProperty.isPending ? "Adding..." : "Add relation"}
              </span>
            </Button>
          </div>
        ) : null}
        <DropDrawerSeparator />
        <DropDrawerItem disabled>
          <CircleHelp />
          <span>Learn about relations</span>
        </DropDrawerItem>
        <AlertDialog open={repairDialogOpen} onOpenChange={setRepairDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Repair relation links?</AlertDialogTitle>
              <AlertDialogDescription>
                Choose which database should be treated as the source of truth.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <RadioGroup
              className="grid gap-2"
              onValueChange={(value) =>
                setRepairPrimarySource(
                  value === "related" ? "related" : "source",
                )
              }
              value={repairPrimarySource}
            >
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-left hover:bg-accent has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent">
                <RadioGroupItem className="mt-0.5" value="source" />
                <span className="grid gap-1">
                  <span className="text-sm font-medium">
                    Use this database as primary
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Mirror {sourceDatabaseName || "this database"} links into{" "}
                    {selectedDatabase.label}.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-left hover:bg-accent has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent">
                <RadioGroupItem className="mt-0.5" value="related" />
                <span className="grid gap-1">
                  <span className="text-sm font-medium">
                    Use related database as primary
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Mirror {selectedDatabase.label} links into{" "}
                    {sourceDatabaseName || "this database"}.
                  </span>
                </span>
              </label>
            </RadioGroup>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={repairRelations}>
                Repair
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  if (isLoading) {
    return <DropDrawerItem disabled>Loading databases...</DropDrawerItem>;
  }

  return (
    <DatabaseSearchableMenuItems
      emptyMessage="No databases available."
      inputAriaLabel="Search relation databases"
      inputIcon={<Search className="size-4" />}
      inputPlaceholder="Search databases..."
      open
      options={databaseOptions}
      renderOption={(option) => {
        const databaseOption = option as RelationDatabaseOption;

        return (
          <DropDrawerItem
            key={databaseOption.value}
            onSelect={(event) => {
              event.preventDefault();
              setSelectedDatabaseId(databaseOption.value);
            }}
          >
            <Database />
            <div className="min-w-0 flex-1">
              <div className="truncate">{databaseOption.label}</div>
              <div className="truncate text-xs text-muted-foreground">
                {databaseOption.pageName}
              </div>
            </div>
          </DropDrawerItem>
        );
      }}
    />
  );
}

export function getRelationConfig(config: unknown): {
  limit?: "no_limit" | "one_page";
  relatedDatabaseId?: string;
  relatedDatabaseName?: string;
  relatedPageName?: string;
  relatedPropertyId?: string;
  relatedPropertyName?: string;
  syncStatus?: "not_synced" | "synced";
  twoWayRelation?: boolean;
} {
  const relation =
    config && typeof config === "object" && !Array.isArray(config)
      ? (config as { relation?: unknown }).relation
      : null;

  if (!relation || typeof relation !== "object" || Array.isArray(relation)) {
    return {};
  }

  const relationConfig = relation as {
    limit?: unknown;
    relatedDatabaseId?: unknown;
    relatedDatabaseName?: unknown;
    relatedPageName?: unknown;
    relatedPropertyId?: unknown;
    relatedPropertyName?: unknown;
    syncStatus?: unknown;
    twoWayRelation?: unknown;
  };

  return {
    limit:
      relationConfig.limit === "one_page" || relationConfig.limit === "no_limit"
        ? relationConfig.limit
        : undefined,
    relatedDatabaseId:
      typeof relationConfig.relatedDatabaseId === "string"
        ? relationConfig.relatedDatabaseId
        : undefined,
    relatedDatabaseName:
      typeof relationConfig.relatedDatabaseName === "string"
        ? relationConfig.relatedDatabaseName
        : undefined,
    relatedPageName:
      typeof relationConfig.relatedPageName === "string"
        ? relationConfig.relatedPageName
        : undefined,
    relatedPropertyId:
      typeof relationConfig.relatedPropertyId === "string"
        ? relationConfig.relatedPropertyId
        : undefined,
    relatedPropertyName:
      typeof relationConfig.relatedPropertyName === "string"
        ? relationConfig.relatedPropertyName
        : undefined,
    syncStatus:
      relationConfig.syncStatus === "not_synced" ||
      relationConfig.syncStatus === "synced"
        ? relationConfig.syncStatus
        : undefined,
    twoWayRelation:
      typeof relationConfig.twoWayRelation === "boolean"
        ? relationConfig.twoWayRelation
        : undefined,
  };
}
