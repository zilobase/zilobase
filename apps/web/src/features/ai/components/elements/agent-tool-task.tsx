"use client";

import {
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
} from "./task";
import { Shimmer } from "./shimmer";
import type { ToolPart } from "./tool";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { isProposePageContentUpdateToolName } from "@zilobase/features/ai-chat";
import { isDatabaseConfigToolPart } from "./database-tool-steps";
import { useEffect, useState } from "react";
import type { AgentToolPresentation } from "./agent-tool-presentation";
import type { AgentProgressSnapshot } from "@zilobase/features/ai-chat";

type AgentToolTaskGroupProps = {
  getToolPresentation: (
    part: ToolPart,
    toolName: string,
  ) => AgentToolPresentation;
  parts: ToolPart[];
  progressByToolCallId?: Map<string, AgentProgressSnapshot>;
};

const finishedLabels: Partial<Record<ToolPart["state"], string>> = {
  "output-available": "Completed",
  "output-denied": "Denied",
  "output-error": "Failed",
};

function getStaticToolName(part: ToolPart) {
  return part.type === "dynamic-tool"
    ? part.toolName
    : part.type.replace(/^tool-/, "");
}

function isAgentToolPart(part: ToolPart) {
  const toolName = getToolName(part);

  return (
    !isProposePageContentUpdateToolName(toolName) &&
    !isDatabaseConfigToolPart(part)
  );
}

const AgentToolTaskItem = ({
  getToolPresentation,
  part,
  progress,
}: {
  getToolPresentation: (
    part: ToolPart,
    toolName: string,
  ) => AgentToolPresentation;
  part: ToolPart;
  progress?: AgentProgressSnapshot;
}) => {
  const toolName = getStaticToolName(part);
  const { progressPhrases, title } = getToolPresentation(part, toolName);
  const finishedLabel = finishedLabels[part.state];
  const isRunning = progress
    ? progress.status === "running"
    : !finishedLabel &&
      (part.state === "input-available" || part.state === "input-streaming");
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    if (!isRunning || progressPhrases.length < 2) {
      return;
    }

    const interval = window.setInterval(() => {
      setPhraseIndex((index) => (index + 1) % progressPhrases.length);
    }, 1700);

    return () => {
      window.clearInterval(interval);
    };
  }, [isRunning, progressPhrases.length]);

  const currentProgressStep = progress?.steps.find(
    (step) => step.status === "running",
  );
  const failedProgressStep = progress
    ? [...progress.steps].reverse().find((step) => step.status === "failed")
    : undefined;
  const statusText = progress?.status === "failed"
    ? failedProgressStep?.detail ?? `Failed: ${progress.title}`
    : progress?.status === "succeeded"
      ? `Completed: ${progress.title}`
      : part.state === "input-streaming"
        ? `Preparing ${title} input`
      : currentProgressStep
        ? currentProgressStep.detail ?? currentProgressStep.label
        : part.errorText
    ? part.errorText
    : finishedLabel
      ? `${finishedLabel}: ${title}`
      : progressPhrases[phraseIndex % progressPhrases.length] ??
        `Running ${title}`;

  return (
    <TaskItem className="flex items-start gap-2">
      <span className="mt-2 size-2 shrink-0 rounded-full bg-indicator-muted" />
      <span className="min-w-0 flex-1">
        {isRunning ? (
          <Shimmer
            as="span"
            className="font-medium text-sm"
            duration={1.35}
            spread={1.1}
          >
            {statusText}
          </Shimmer>
        ) : (
          <span
            className={
              part.errorText || progress?.status === "failed"
                ? "text-action-danger-text text-sm"
                : "text-content-secondary text-sm"
            }
          >
            {statusText}
          </span>
        )}
      </span>
    </TaskItem>
  );
};

export const AgentToolTaskGroup = ({
  getToolPresentation,
  parts,
  progressByToolCallId,
}: AgentToolTaskGroupProps) => {
  const hasActiveStep = parts.some(
    (part) => {
      const progress = progressByToolCallId?.get(part.toolCallId);
      return progress
        ? progress.status === "running"
        : !finishedLabels[part.state];
    },
  );
  const hasError = parts.some(
    (part) =>
      progressByToolCallId?.get(part.toolCallId)?.status === "failed" ||
      part.state === "output-error" || Boolean(part.errorText),
  );
  const title = hasActiveStep
    ? "Working with Zilobase"
    : hasError
      ? "Work finished with errors"
      : parts.length === 1
        ? getToolPresentation(parts[0]!, getStaticToolName(parts[0]!)).title
        : "Completed agent steps";

  return (
    <Task className="not-prose mb-3" defaultOpen={hasActiveStep || hasError}>
      <TaskTrigger title={title} />
      <TaskContent>
        {parts.map((part) => (
          <AgentToolTaskItem
            getToolPresentation={getToolPresentation}
            key={part.toolCallId}
            part={part}
            progress={progressByToolCallId?.get(part.toolCallId)}
          />
        ))}
      </TaskContent>
    </Task>
  );
};

export const AgentProgressOnlyTask = ({
  progress,
}: {
  progress: AgentProgressSnapshot;
}) => {
  const currentStep = progress.steps.find((step) => step.status === "running");
  const failedStep = [...progress.steps].reverse().find(
    (step) => step.status === "failed",
  );
  const statusText = progress.status === "failed"
    ? failedStep?.detail ?? `Failed: ${progress.title}`
    : progress.status === "succeeded"
      ? `Completed: ${progress.title}`
      : currentStep?.detail ?? currentStep?.label ??
        `Executing ${progress.title}`;

  return (
    <Task className="not-prose mb-3" defaultOpen>
      <TaskTrigger title={progress.title} />
      <TaskContent>
        <TaskItem className="flex items-start gap-2">
          <span className="mt-2 size-2 shrink-0 rounded-full bg-indicator-muted" />
          {progress.status === "running" ? (
            <Shimmer
              as="span"
              className="font-medium text-sm"
              duration={1.35}
              spread={1.1}
            >
              {statusText}
            </Shimmer>
          ) : (
            <span className={
              progress.status === "failed"
                ? "text-action-danger-text text-sm"
                : "text-content-secondary text-sm"
            }>
              {statusText}
            </span>
          )}
        </TaskItem>
      </TaskContent>
    </Task>
  );
};

export type MessagePartGroup =
  | {
      index: number;
      part: UIMessage["parts"][number];
      type: "part";
    }
  | {
      parts: ToolPart[];
      startIndex: number;
      type: "database-tools";
    }
  | {
      parts: ToolPart[];
      startIndex: number;
      type: "agent-tools";
    };

export function buildMessagePartGroups(
  parts: UIMessage["parts"],
): MessagePartGroup[] {
  const groups: MessagePartGroup[] = [];

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];

    if (isToolUIPart(part) && isDatabaseConfigToolPart(part)) {
      const databaseParts: ToolPart[] = [part];
      let nextIndex = index + 1;

      while (nextIndex < parts.length) {
        let candidateIndex = nextIndex;

        while (
          candidateIndex < parts.length &&
          isTransparentToolGroupingPart(parts[candidateIndex]!)
        ) {
          candidateIndex += 1;
        }

        const nextPart = parts[candidateIndex];

        if (
          !nextPart ||
          !isToolUIPart(nextPart) ||
          !isDatabaseConfigToolPart(nextPart)
        ) {
          break;
        }

        databaseParts.push(nextPart);
        nextIndex = candidateIndex + 1;
      }

      groups.push({
        type: "database-tools",
        startIndex: index,
        parts: databaseParts,
      });
      index = nextIndex - 1;
      continue;
    }

    if (isToolUIPart(part) && isAgentToolPart(part)) {
      const agentParts: ToolPart[] = [part];
      let nextIndex = index + 1;

      while (nextIndex < parts.length) {
        const nextPart = parts[nextIndex];

        if (!(isToolUIPart(nextPart) && isAgentToolPart(nextPart))) {
          break;
        }

        agentParts.push(nextPart);
        nextIndex += 1;
      }

      groups.push({
        type: "agent-tools",
        startIndex: index,
        parts: agentParts,
      });
      index = nextIndex - 1;
      continue;
    }

    groups.push({
      type: "part",
      index,
      part,
    });
  }

  return groups;
}

function isTransparentToolGroupingPart(part: UIMessage["parts"][number]) {
  return part.type === "reasoning" ||
    part.type === "step-start" ||
    ("type" in part && part.type === "data-agent-progress");
}
