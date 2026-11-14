import type { ChatMessage, ChatToolActivity } from "@zilobase/features/ai";
import { Trace } from "@/components/ui/trace";
import { ActivityDisclosure } from "./activity-trace";
import { useDecideAiAction, useUndoAiAction } from "@zilobase/features/ai/react";
import { useContext } from "react";
import { Button } from "@/components/ui/button";
import { AnswerSources, ChatSourceContext } from "./answer-sources";
import { searchAvailabilityNotice } from "@zilobase/features/search";

type ReadGroup = {
  id: string;
  source?: ChatToolActivity["source"];
  calls: ChatToolActivity[];
};

// Pagination advances a source's reading state instead of adding another tool row.
export function groupSourceReads(message: ChatMessage) {
  const groups = new Map<string, ReadGroup>();
  const unique = new Map(message.progress?.activities.map((activity) => [activity.id, activity]));
  for (const activity of unique.values()) {
    const candidates = message.context?.manifest.filter((entry) => entry.type === "page");
    // Older saved runs have no source association. Resolve only an unambiguous
    // completed page read; never guess between selected or discovered pages.
    const legacySource =
      activity.name === "read_page" && activity.status === "completed" && candidates?.length === 1
        ? { type: "page" as const, id: candidates[0]!.id }
        : undefined;
    const source: ChatToolActivity["source"] = activity.source ?? legacySource;
    const id = source
      ? `${activity.name}:${source.type}:${source.id}:${source.dataSourceId ?? ""}`
      : activity.id;
    const group = groups.get(id) ?? { id, source, calls: [] };
    group.calls.push(activity);
    groups.set(id, group);
  }
  return [...groups.values()];
}

function readLabel(activity: ChatToolActivity, active: boolean) {
  if (activity.name === "workspace_action") {
    if (activity.status === "failed") return `Couldn't finish: ${activity.label}`;
    if (activity.status === "running") return active ? activity.label : `${activity.label} stopped`;
    return `${activity.label} done`;
  }
  if (activity.name === "search_workspace" || activity.name === "semantic_search_workspace") {
    const kind = activity.name === "search_workspace" ? "Keyword" : "Semantic";
    if (activity.status === "failed") return `Couldn't finish ${kind.toLowerCase()} search`;
    if (activity.status === "running") return active ? `${kind} search` : `${kind} search stopped`;
    if (searchAvailabilityNotice(activity.searchMetadata)) {
      if (activity.searchMetadata?.indexAvailability === "building")
        return "Semantic search indexing";
      if (activity.searchMetadata?.indexAvailability === "disabled")
        return "Semantic search disabled";
      if (activity.searchMetadata?.indexAvailability === "ready") return "Semantic search degraded";
      return "Semantic search unavailable";
    }
    return `${kind} search completed`;
  }
  if (activity.status === "failed") return "Couldn't read source";
  if (activity.cached && activity.status === "completed") return "Source reused";
  if (activity.status === "running") {
    if (!active) return "Reading stopped";
    return {
      read_page: "Reading page",
      describe_source: "Inspecting source",
      query_records: "Reading records",
      read_record: "Reading record",
      aggregate_records: "Calculating totals",
    }[activity.name];
  }
  switch (activity.name) {
    case "read_page":
      return activity.hasMore ? "Partially read" : "Page read";
    case "describe_source":
      return activity.hasMore ? "Partially inspected" : "Source inspected";
    case "query_records":
      return "Records read";
    case "read_record":
      return "Record read";
    case "aggregate_records":
      return "Totals calculated";
  }
}

export function ReadActivity({ message, active }: { message: ChatMessage; active: boolean }) {
  const groups = groupSourceReads(message);
  const compaction = message.progress?.compaction;
  if (!groups.length && !compaction) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2" aria-label="Source reading activity">
      {compaction && (
        <div
          aria-label="Conversation compaction"
          role={active ? "status" : undefined}
          aria-live={active ? "polite" : undefined}
        >
          <Trace data-compaction-status={compaction.status}>
            <ActivityDisclosure
              title={
                compaction.status === "running"
                  ? active
                    ? "Compacting conversation"
                    : "Compaction interrupted"
                  : compaction.status === "failed"
                    ? "Couldn't compact conversation"
                    : "Conversation compacted"
              }
              status={compaction.status === "running" && !active ? "stopped" : compaction.status}
            >
              <p className="text-xs text-content-secondary">
                {compaction.status === "running"
                  ? active
                    ? "Summarizing earlier context so the conversation can continue. Your messages remain in the chat."
                    : "The original conversation is preserved. Retry to resume."
                  : compaction.status === "failed"
                    ? "The original conversation is preserved. Retry your message to try again."
                    : `Earlier context was summarized while retaining the task, decisions, and reading progress. ${compaction.summarizedMessages} messages summarized${compaction.count > 1 ? ` across ${compaction.count} compactions` : ""}.`}
              </p>
            </ActivityDisclosure>
          </Trace>
        </div>
      )}
      {groups.map((group) => {
        const latest = group.calls.at(-1)!;
        const running = active && group.calls.some((call) => call.status === "running");
        const activity = running
          ? [...group.calls].reverse().find((call) => call.status === "running")!
          : latest;
        const status = activity.status === "running" && !active ? "stopped" : activity.status;
        const source = group.source;
        const entry = message.context?.manifest.find(
          (entry) => entry.type === source?.type && entry.id === source.id,
        );
        type ChangedLink = { key: string; title: string; pageId?: string; databaseId?: string };
        const changed = (latest.name === "workspace_action" ? (latest.changes ?? []) : []).flatMap(
          (change): ChangedLink[] =>
            change.pageId
              ? [{ key: `page:${change.pageId}`, title: "Page", pageId: change.pageId }]
              : change.databaseId
                ? [
                    {
                      key: `database:${change.databaseId}`,
                      title: "Database",
                      databaseId: change.databaseId,
                    },
                  ]
                : [],
        );
        const sourceLink =
          entry ??
          (source
            ? {
                key: `${source.type}:${source.id}`,
                title: source.type === "page" ? "Page" : "Database",
                ...(source.type === "page" ? { pageId: source.id } : { databaseId: source.id }),
              }
            : undefined);
        const links = changed.length
          ? [...new Map(changed.map((link) => [link.key, link])).values()]
          : sourceLink
            ? [sourceLink]
            : [];
        const records =
          latest.name === "query_records"
            ? group.calls.reduce((sum, call) => sum + (call.returned ?? 0), 0)
            : undefined;
        const morePageContent =
          latest.hasMore ??
          [...group.calls].reverse().find((call) => call.status === "completed")?.hasMore;
        const changeCount = latest.changes?.length ?? 0;
        const detail =
          latest.name === "workspace_action"
            ? status === "failed"
              ? (latest.error ?? "The change couldn't be completed.")
              : status === "stopped"
                ? "The change didn't finish."
                : status === "completed"
                  ? `${changeCount} ${changeCount === 1 ? "change" : "changes"} saved`
                  : undefined
            : (searchAvailabilityNotice(latest.searchMetadata) ??
              (latest.name === "search_workspace" || latest.name === "semantic_search_workspace"
                ? status === "failed"
                  ? "Workspace search couldn't finish."
                  : status === "stopped"
                    ? "The search didn't finish."
                    : [
                        latest.query ? `“${latest.query}”` : undefined,
                        status === "completed"
                          ? `${latest.returned ?? 0} matching sources${latest.hasMore ? " · refine the search for other matches" : ""}`
                          : undefined,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                : status === "failed"
                  ? "This source couldn't be read."
                  : status === "stopped"
                    ? "The read didn't finish."
                    : latest.name === "read_page" && morePageContent
                      ? running
                        ? "Reading more of this page"
                        : "More of this page is available"
                      : records !== undefined && status === "completed"
                        ? `${records} ${records === 1 ? "record" : "records"}${latest.hasMore ? " · more available" : ""}`
                        : undefined));
        return (
          <Trace
            key={group.id}
            data-ai-read-source={source ? `${source.type}:${source.id}` : undefined}
            data-ai-action={latest.name === "workspace_action" ? latest.action : undefined}
            data-read-status={status}
          >
            <ActivityDisclosure title={readLabel(activity, active)} status={status}>
              {links.length > 0 && (
                <AnswerSources
                  citations={links}
                  label={latest.name === "workspace_action" ? "Changed items" : "Read source link"}
                  className="mt-0 max-w-full"
                />
              )}
              {detail && <p className="mt-1.5 text-xs text-content-secondary">{detail}</p>}
              {latest.name === "workspace_action" &&
                status === "completed" &&
                latest.invocationId &&
                (latest.confirmation === "pending" ? (
                  <ConfirmAction activity={latest} />
                ) : (
                  (latest.changes?.length ?? 0) > 0 && <UndoAction activity={latest} />
                ))}
              {!links.length && !detail && (
                <p className="text-xs">Source details are unavailable.</p>
              )}
            </ActivityDisclosure>
          </Trace>
        );
      })}
    </div>
  );
}

/** Undoes one AI change; the server refuses changes it cannot reverse exactly. */
function UndoAction({ activity }: { activity: ChatToolActivity }) {
  const { workspaceId } = useContext(ChatSourceContext);
  const undo = useUndoAiAction(workspaceId ?? "");
  if (!workspaceId) return null;
  if (undo.isSuccess) return <p className="mt-1.5 text-xs text-content-secondary">Undone</p>;
  const message = undo.error instanceof Error ? undo.error.message : null;
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <Button
        disabled={undo.isPending}
        onClick={() => undo.mutate(activity)}
        size="sm"
        type="button"
        variant="ghost"
      >
        {undo.isPending ? "Undoing…" : "Undo"}
      </Button>
      {message && <p className="text-xs text-feedback-danger-text">{message}</p>}
    </div>
  );
}

/** A destructive action the AI proposed runs only when the user confirms it here. */
function ConfirmAction({ activity }: { activity: ChatToolActivity }) {
  const { workspaceId } = useContext(ChatSourceContext);
  const decide = useDecideAiAction(workspaceId ?? "");
  if (!workspaceId) return null;
  if (decide.data?.status === "cancelled")
    return <p className="mt-1.5 text-xs text-content-secondary">Cancelled. Nothing changed.</p>;
  if (decide.data) return <UndoAction activity={decide.data.activity} />;
  const message = decide.error instanceof Error ? decide.error.message : null;
  return (
    <div className="mt-1.5 space-y-1.5">
      <p className="text-xs text-content-secondary">
        Waiting for your confirmation. Nothing has changed yet.
      </p>
      <div className="flex items-center gap-2">
        <Button
          disabled={decide.isPending}
          onClick={() => decide.mutate({ activity, decision: "confirm" })}
          size="sm"
          type="button"
          variant="destructive"
        >
          {decide.isPending ? "Working…" : "Confirm"}
        </Button>
        <Button
          disabled={decide.isPending}
          onClick={() => decide.mutate({ activity, decision: "cancel" })}
          size="sm"
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
      </div>
      {message && <p className="text-xs text-feedback-danger-text">{message}</p>}
    </div>
  );
}
