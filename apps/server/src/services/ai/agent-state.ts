import type { ModelMessage } from "ai";
import type { ChatDebugLog, ChatReadProgress, ChatToolName } from "@zilobase/features/runtime";
import type { BuildContextResult, ResourceRef } from "@zilobase/page-context";
import type { ConversationMemory, HistoryTurn } from "./compaction";
import type { SearchIntent } from "./intent";
import {
  newAgentKnowledge,
  hasRemainingReads,
  restoreAgentKnowledge,
  type AgentKnowledge,
} from "./agent-memory";

export type ReadCursor = {
  fingerprint: string;
  revision: unknown;
  position: unknown;
  expiresAt: number;
};
export type ReadGrant = { resource: ResourceRef; parent?: ResourceRef; sourceId?: string };
export type PendingRead = { name: ChatToolName; input: Record<string, unknown> };
export type AgentState = {
  version: 2;
  workspaceId: string;
  roots: ResourceRef[];
  task: string;
  intent?: SearchIntent;
  grants: ReadGrant[];
  cursors: Record<string, ReadCursor>;
  pending: Record<string, PendingRead>;
  messages: ModelMessage[];
  context: BuildContextResult;
  progress: ChatReadProgress;
  debug?: ChatDebugLog;
  steps: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  conversation?: { turns: HistoryTurn[]; memory?: ConversationMemory; dirty?: boolean };
  knowledge?: AgentKnowledge;
  committedText: string;
  omittedResults: number;
  expiresAt: number;
  searchListing?: {
    matches: Array<{ type: "page" | "database"; id: string; title: string }>;
    emitted?: boolean;
    searchMetadata?: import("@zilobase/features/search").SearchMetadata;
  };
  continuation?: { initialProgress: string };
  inventoryMessage?: string;
};

export const emptyChatContext = (): BuildContextResult => ({
  version: 1,
  status: "complete",
  markdown: "",
  charCount: 0,
  manifest: [],
  omissions: [],
  trimmedAttachmentIds: [],
});

export function createAgentState(
  workspaceId: string,
  roots: ResourceRef[],
  messages: ModelMessage[],
): AgentState {
  return {
    version: 2,
    workspaceId,
    roots,
    task: String(messages.findLast((m) => m.role === "user")?.content ?? ""),
    grants: roots.map((resource) => ({ resource })),
    cursors: {},
    pending: {},
    messages,
    context: emptyChatContext(),
    progress: { activities: [], canContinue: false },
    steps: 0,
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    knowledge: newAgentKnowledge(),
    committedText: "",
    omittedResults: 0,
    expiresAt: Date.now() + 3_600_000,
  };
}

export function updateReadCoverage(state: AgentState) {
  const count = Object.keys(state.pending).length;
  state.progress.canContinue =
    !state.searchListing &&
    !["source_unavailable", "no_progress"].includes(state.progress.stopReason ?? "") &&
    (count > 0 || (!!state.progress.stopReason && hasRemainingReads(state)));
  state.context.omissions = [
    ...(count ? [`${count} source reads have additional pages. Results are not exhaustive.`] : []),
    ...(state.progress.stopReason
      ? [
          state.progress.stopReason === "no_progress"
            ? "Retrieval made no further progress. Narrow the request for further reading."
            : state.progress.stopReason === "source_unavailable"
              ? "A previously inspected source is no longer accessible."
              : "Reading paused with unfinished sources.",
        ]
      : []),
  ];
  state.context.status = state.context.omissions.length ? "partial" : "complete";
}

/** Compare actual read progress, not tool-call counts or newly generated cursor IDs. */
export function readProgressKey(state: AgentState) {
  const ordered = (entries: unknown[]) => entries.map((entry) => JSON.stringify(entry)).sort();
  return JSON.stringify([
    ordered(state.knowledge?.reads ?? []),
    ordered(state.knowledge?.sources ?? []),
    ordered(
      Object.entries(state.pending).map(([key, read]) => [
        key,
        state.cursors[String(read.input.cursor)]?.position,
      ]),
    ),
  ]);
}

/** Start a fresh model window while retaining read positions and completed-source identities. */
export function resumeAgentState(state: AgentState) {
  restoreAgentKnowledge(state);
  updateReadCoverage(state);
  if (!state.progress.canContinue) return false;
  state.continuation = { initialProgress: readProgressKey(state) };
  state.messages = [
    {
      role: "user",
      content: `Original task: ${state.task}\nContinue only unfinished reads from the retained inventory. Resume pending cursors first, then relevant unread sources. Do not search again or repeat completed pages. Summarize newly read evidence; earlier source content is not replayed in this model window.`,
    },
  ];
  state.steps = 0;
  state.calls = 0;
  state.inputTokens = 0;
  state.outputTokens = 0;
  state.knowledge!.repeatedInspections = 0;
  state.committedText = "";
  state.omittedResults = 0;
  state.progress = { activities: [], canContinue: true };
  state.debug = undefined;
  return true;
}
