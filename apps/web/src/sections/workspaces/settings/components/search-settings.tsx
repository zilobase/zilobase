import {
  useReindexWorkspaceSearch,
  useUpdateWorkspaceSearchSettings,
  useWorkspaceSearchSettings,
} from "@zilobase/features/search/react";
import { Button } from "@/components/ui/button";

export function WorkspaceSearchSettingsSection({ workspaceId }: { workspaceId: string | null }) {
  const settings = useWorkspaceSearchSettings(workspaceId);
  const update = useUpdateWorkspaceSearchSettings(workspaceId);
  const reindex = useReindexWorkspaceSearch(workspaceId);
  const data = settings.data;
  const total = data
    ? data.progress.ready + data.progress.pending + data.progress.running + data.progress.failed
    : 0;
  const busy = update.isPending || reindex.isPending;
  const error = update.error || reindex.error;
  return (
    <section className="grid gap-3" aria-labelledby="workspace-search-heading">
      <div className="space-y-1">
        <h3 id="workspace-search-heading" className="font-heading text-base font-medium">
          Semantic search
        </h3>
        <p className="text-sm text-content-secondary">
          Let AI find pages by meaning. Global search in the sidebar uses keywords. Enabling this
          sends page text and supported property values to Google for search embeddings.
        </p>
      </div>
      {settings.isPending ? (
        <p className="text-sm text-content-secondary">Loading search settings…</p>
      ) : settings.isError ? (
        <p role="alert" className="text-sm text-content-secondary">
          Search settings could not be loaded.
        </p>
      ) : data ? (
        <>
          <p className="text-sm text-content-secondary" role="status">
            {data.enabled
              ? `${data.progress.ready} of ${total} pages indexed · ${data.progress.running} processing · ${data.progress.pending} queued${!data.backfillComplete ? " · Scanning workspace" : ""}${data.progress.failed ? ` · ${data.progress.failed} failed` : ""}`
              : "Semantic search is disabled. Keyword search remains available."}
          </p>
          {data.enabled && total > 0 ? (
            <progress
              className="h-2 w-full accent-action-primary"
              aria-label="Pages indexed for semantic search"
              value={data.backfillComplete ? data.progress.ready : undefined}
              max={total}
            />
          ) : null}
          {data.enabled && data.progress.pending + data.progress.running > 0 ? (
            <p className="text-sm text-content-secondary">
              Indexing runs in the background in batches. Progress refreshes every five seconds;
              queued pages may wait for the next batch or the embedding rate limit.
            </p>
          ) : null}
          {!data.capability.available ? (
            <p className="text-sm text-content-secondary">
              A deployment administrator must configure Gemini search and its background queue
              before this workspace can enable it.
            </p>
          ) : null}
          {data.lastErrorCode ? (
            <p className="text-sm text-content-secondary">
              Some indexing work needs attention. Reindex after resolving the deployment or provider
              issue.
            </p>
          ) : null}
          {data.canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={busy || (!data.enabled && !data.capability.available)}
                onClick={() => update.mutate(!data.enabled)}
              >
                {update.isPending
                  ? "Saving…"
                  : data.enabled
                    ? "Disable semantic search"
                    : "Enable semantic search"}
              </Button>
              {data.enabled ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    busy ||
                    !data.capability.available ||
                    (!data.backfillComplete && !data.lastErrorCode)
                  }
                  onClick={() => reindex.mutate()}
                >
                  {reindex.isPending ? "Scheduling…" : "Reindex workspace"}
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-content-secondary">
              Workspace owners and admins can change this setting.
            </p>
          )}
        </>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-content-secondary">
          {error instanceof Error ? error.message : "Search settings could not be updated."}
        </p>
      ) : null}
    </section>
  );
}
