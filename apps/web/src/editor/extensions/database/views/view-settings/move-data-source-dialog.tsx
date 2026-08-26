import {
  useMoveDatabase,
  type MoveDatabaseInput,
} from "@zilobase/features/databases";
import {
  usePageNavigation,
  type PageNavigationPayload,
} from "@zilobase/features/pages";
import {
  ArrowLeft,
  Database,
  FileText,
  FolderInput,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getApiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

import type { DatabaseSourceMenuItem } from "./types";

type MoveDestination = Pick<
  MoveDatabaseInput,
  "destinationId" | "destinationKind"
> & {
  description: string;
  label: string;
};

export function MoveDataSourceDialog({
  hostDatabaseId,
  onMoved,
  onOpenChange,
  open,
  source,
  workspaceId,
}: {
  hostDatabaseId?: string;
  onMoved?: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  source: DatabaseSourceMenuItem | null;
  workspaceId?: string;
}) {
  const [destination, setDestination] = useState<MoveDestination | null>(null);
  const [query, setQuery] = useState("");
  const moveDatabase = useMoveDatabase();
  const { data: navigation, isLoading } = usePageNavigation(workspaceId, {
    enabled: open,
  });
  const destinations = useMemo(
    () => getMoveDestinations(navigation, source),
    [navigation, source],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const filteredDestinations = normalizedQuery
    ? destinations.filter((candidate) =>
        `${candidate.label} ${candidate.description}`
          .toLowerCase()
          .includes(normalizedQuery),
      )
    : destinations;

  useEffect(() => {
    if (open) return;

    setDestination(null);
    setQuery("");
  }, [open]);

  const runMove = (moveViews: boolean) => {
    if (!destination || !source || !workspaceId) return;

    moveDatabase.mutate(
      {
        databaseId: source.id,
        destinationId: destination.destinationId,
        destinationKind: destination.destinationKind,
        hostDatabaseId,
        moveViews,
        workspaceId,
      },
      {
        onError: (error) => toast.error(getApiErrorMessage(error)),
        onSuccess: () => {
          toast.success(`Moved ${source.name} to ${destination.label}.`);
          onOpenChange(false);
          onMoved?.();
        },
      },
    );
  };

  const viewLabel = `${source?.viewCount ?? 0} view${source?.viewCount === 1 ? "" : "s"}`;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className={cn("sm:max-w-md", destination && "sm:max-w-lg")}>
        {destination ? (
          <>
            <Button
              aria-label="Choose another destination"
              className="absolute top-2 left-2"
              disabled={moveDatabase.isPending}
              onClick={() => setDestination(null)}
              size="icon-sm"
              variant="ghost"
            >
              <ArrowLeft />
            </Button>
            <DialogHeader className="items-center pt-6 text-center">
              <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <FolderInput className="size-5" />
              </span>
              <DialogTitle className="mt-2 text-lg">
                Moving data source {source?.name || "Untitled"}
              </DialogTitle>
              <DialogDescription className="max-w-72 text-sm">
                This data source has {viewLabel}. Choose whether its hosted
                views should move to {destination.label} too.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 pt-2">
              <Button
                className="h-10 w-full text-sm"
                disabled={moveDatabase.isPending}
                onClick={() => runMove(true)}
              >
                {moveDatabase.isPending
                  ? "Moving…"
                  : `Move data source and ${viewLabel}`}
              </Button>
              <Button
                className="h-9 w-full text-sm"
                disabled={moveDatabase.isPending}
                onClick={() => runMove(false)}
                variant="ghost"
              >
                Move data source only
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Move {source?.name || "data source"} to…</DialogTitle>
              <DialogDescription>
                Choose a page or another database in this workspace.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 rounded-md border border-input bg-background px-2">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <Input
                aria-label="Search move destinations"
                autoFocus
                className="border-0 bg-transparent px-0 shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search pages and databases…"
                value={query}
              />
            </div>
            <div className="max-h-80 overflow-y-auto overscroll-contain rounded-md border border-border p-1">
              {isLoading ? (
                <p className="px-2 py-6 text-center text-muted-foreground">
                  Loading destinations…
                </p>
              ) : filteredDestinations.length > 0 ? (
                filteredDestinations.map((candidate) => (
                  <button
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    key={`${candidate.destinationKind}:${candidate.destinationId}`}
                    onClick={() => setDestination(candidate)}
                    type="button"
                  >
                    {candidate.destinationKind === "database" ? (
                      <Database className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {candidate.label}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {candidate.description}
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-2 py-6 text-center text-muted-foreground">
                  No matching destinations.
                </p>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function getMoveDestinations(
  navigation: PageNavigationPayload | undefined,
  source: DatabaseSourceMenuItem | null,
): MoveDestination[] {
  if (!navigation || !source) return [];

  const sourcePrimary = navigation.placements.find(
    (placement) =>
      placement.itemKind === "database" &&
      placement.itemId === source.id &&
      placement.placementKind === "primary",
  );
  const sourceRowPageIds = new Set(
    navigation.placements.flatMap((placement) =>
      placement.parentKind === "database" &&
      placement.parentId === source.id &&
      placement.itemKind === "page" &&
      placement.placementKind === "database_row"
        ? [placement.itemId]
        : [],
    ),
  );
  const pages = navigation.pages
    .filter(
      (page) =>
        !page.deletedAt &&
        page.type !== "meeting" &&
        !sourceRowPageIds.has(page.id) &&
        !(
          sourcePrimary?.parentKind === "page" &&
          sourcePrimary.parentId === page.id
        ),
    )
    .map<MoveDestination>((page) => ({
      destinationId: page.id,
      destinationKind: "page",
      description: page.teamspaceId ? "Teamspace page" : "Page",
      label: page.name.trim() || "Untitled",
    }));
  const databases = navigation.databases
    .filter(
      (database) =>
        !database.deletedAt &&
        database.id !== source.id &&
        !(
          sourcePrimary?.parentKind === "database" &&
          sourcePrimary.parentId === database.id
        ),
    )
    .map<MoveDestination>((database) => ({
      destinationId: database.id,
      destinationKind: "database",
      description: "Database",
      label: database.name.trim() || "Untitled database",
    }));

  return [...pages, ...databases].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}
