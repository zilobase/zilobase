import {
  AGENT_TOOL_DESCRIPTORS,
  getAgentToolDescriptor,
} from "@zilobase/features/ai-chat/tool-registry";
import type { ToolSet } from "ai";

import type { RuntimeEnv } from "../../../shared/config/config";
import { buildAnalysisTools } from "../tools/ask-ai-analysis-tools";
import { buildArtifactTools } from "../tools/ask-ai-artifact-tools";
import { buildDatabaseConfigTools } from "../tools/ask-ai-database-tools";
import { buildPageEditTools } from "../tools/ask-ai-page-tools";
import { buildWorkspaceActionTools } from "../tools/ask-ai-workspace-action-tools";
import { buildWorkspaceReadTools } from "../tools/ask-ai-workspace-tools";
import { requestAgentActionApproval } from "./agent-approvals";

export type AgentToolRegistryContext = {
  editablePageIds: string[];
  env: RuntimeEnv;
  primaryPageId: string | null;
  threadId: string;
  userId: string;
  workspaceId: string;
  withDb: <T>(fn: () => Promise<T>) => Promise<T>;
};

export function buildRegisteredAgentTools(
  context: AgentToolRegistryContext,
  options?: { bypassApprovals?: boolean },
): ToolSet {
  const tools: ToolSet = {
    ...buildAnalysisTools(),
    ...buildWorkspaceReadTools({
      userId: context.userId,
      workspaceId: context.workspaceId,
      withDb: context.withDb,
    }),
    ...buildWorkspaceActionTools(context),
    ...buildArtifactTools(context),
    ...buildDatabaseConfigTools({
      ...context,
      allowedPageIds: new Set(context.editablePageIds),
    }),
    ...(context.editablePageIds.length > 0
      ? buildPageEditTools(context.editablePageIds)
      : {}),
  };

  const unknownTools = Object.keys(tools).filter(
    (name) => !getAgentToolDescriptor(name),
  );
  if (unknownTools.length > 0) {
    throw new Error(`Agent tools missing registry descriptors: ${unknownTools.join(", ")}`);
  }
  const duplicateNames = AGENT_TOOL_DESCRIPTORS
    .map((descriptor) => descriptor.name)
    .filter((name, index, names) => names.indexOf(name) !== index);
  if (duplicateNames.length > 0) {
    throw new Error(`Duplicate agent tool descriptors: ${duplicateNames.join(", ")}`);
  }
  if (options?.bypassApprovals) return tools;

  const createdObjectIds = new Set<string>();
  const pendingReviewTargetKeys = new Set<string>();
  return Object.fromEntries(Object.entries(tools).map(([name, registeredTool]) => {
    const descriptor = getAgentToolDescriptor(name)!;
    if (!("execute" in registeredTool) || typeof registeredTool.execute !== "function") {
      return [name, registeredTool];
    }
    const execute = registeredTool.execute;

    return [name, {
      ...registeredTool,
      execute: async (toolInput: unknown, toolOptions: { toolCallId: string }) => {
        try {
          if (
            descriptor.risk === "review" &&
            name !== "proposePageContentUpdate" &&
            !isSameTurnCreatedTarget(name, toolInput, createdObjectIds)
          ) {
            const targetKey = getReviewTargetKey(name, toolInput);
            if (targetKey && pendingReviewTargetKeys.has(targetKey)) {
              return {
                error: { code: "duplicate_review_target", retryable: false },
                ok: false,
                status: "unavailable",
                summary: "Only one approval can be requested for the same object in a turn. Combine all requested changes into one update.",
              };
            }
            if (targetKey) pendingReviewTargetKeys.add(targetKey);
            try {
              return await context.withDb(() => requestAgentActionApproval({
                descriptor,
                threadId: context.threadId,
                toolCallId: toolOptions.toolCallId,
                toolInput,
                userId: context.userId,
                workspaceId: context.workspaceId,
              }));
            } catch (error) {
              if (targetKey) pendingReviewTargetKeys.delete(targetKey);
              throw error;
            }
          }
          const result = await execute(toolInput as never, toolOptions as never);
          if (CREATION_TOOL_NAMES.has(name)) collectCreatedIds(result, createdObjectIds);
          return result;
        } catch (error) {
          console.error(JSON.stringify({
            code: readSafeToolErrorCode(error),
            event: "ai_agent_tool_execution_failed",
            toolName: name,
            toolVersion: descriptor.version,
          }));
          throw new Error(`${descriptor.title} could not be completed. Please try again.`);
        }
      },
    }];
  })) as ToolSet;
}

function getReviewTargetKey(toolName: string, input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const targetFields: Record<string, string[]> = {
    updateDataSource: ["dataSourceId"],
    updateDatabaseProperty: ["databasePropertyId"],
    updateDatabaseView: ["viewId"],
    updateWorkspacePage: ["pageId"],
  };
  const targetId = (targetFields[toolName] ?? []).map((field) => value[field])
    .find((item): item is string => typeof item === "string" && item.length > 0);

  return targetId ? `${toolName}:${targetId}` : null;
}

const CREATION_TOOL_NAMES = new Set([
  "createPage",
  "createDatabase",
  "createDatabaseProperty",
  "createDatabaseView",
  "createDatabaseRow",
]);

function isSameTurnCreatedTarget(
  toolName: string,
  input: unknown,
  createdObjectIds: Set<string>,
) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>;
  const targetFields: Record<string, string[]> = {
    updateDataSource: ["dataSourceId"],
    updateDatabaseProperty: ["databasePropertyId"],
    updateDatabaseView: ["viewId"],
    updateWorkspacePage: ["pageId"],
  };
  return (targetFields[toolName] ?? []).some((field) =>
    typeof value[field] === "string" && createdObjectIds.has(value[field])
  );
}

function collectCreatedIds(value: unknown, ids: Set<string>) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectCreatedIds(item, ids);
    return;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key.endsWith("Id") && typeof item === "string") ids.add(item);
    else collectCreatedIds(item, ids);
  }
}

function readSafeToolErrorCode(error: unknown) {
  let current = error;
  const seen = new Set<unknown>();

  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as { cause?: unknown; code?: unknown };
    if (
      typeof record.code === "string" &&
      /^[a-z0-9_]{2,40}$/i.test(record.code)
    ) {
      return record.code;
    }
    current = record.cause;
  }
  return "unexpected_error";
}
