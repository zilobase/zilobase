"use client";

import {
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
} from "@/components/ai-elements/task";
import { Shimmer } from "@/components/ai-elements/shimmer";
import type { ToolPart } from "@/components/ai-elements/tool";
import { integrationIcons } from "@/lib/integration-icons";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { isProposePageContentUpdateToolName } from "@zilobase/features/ai-chat";
import { isDatabaseConfigToolPart } from "@/components/ai-elements/database-tool-steps";
import { useEffect, useState } from "react";
import type { IntegrationToolPresentation } from "@/components/ai-elements/integration-tool-presentation";

type IntegrationToolTaskGroupProps = {
  getToolPresentation: (
    part: ToolPart,
    toolName: string,
  ) => IntegrationToolPresentation;
  parts: ToolPart[];
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

function isIntegrationToolPart(part: ToolPart) {
  const toolName = getToolName(part);

  return (
    !isProposePageContentUpdateToolName(toolName) &&
    !isDatabaseConfigToolPart(part)
  );
}

const IntegrationToolTaskItem = ({
  getToolPresentation,
  part,
}: {
  getToolPresentation: (
    part: ToolPart,
    toolName: string,
  ) => IntegrationToolPresentation;
  part: ToolPart;
}) => {
  const toolName = getStaticToolName(part);
  const { progressPhrases, source, title } = getToolPresentation(part, toolName);
  const finishedLabel = finishedLabels[part.state];
  const isRunning =
    !finishedLabel &&
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

  const statusText = part.errorText
    ? part.errorText
    : finishedLabel
      ? `${finishedLabel}: ${title}`
      : progressPhrases[phraseIndex % progressPhrases.length] ?? `Running ${title}`;

  return (
    <TaskItem className="flex items-start gap-2">
      {source ? (
        <img
          alt=""
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0"
          src={integrationIcons[source]}
        />
      ) : (
        <span className="mt-2 size-2 shrink-0 rounded-full bg-muted-foreground/60" />
      )}
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
              part.errorText
                ? "text-destructive text-sm"
                : "text-muted-foreground text-sm"
            }
          >
            {statusText}
          </span>
        )}
      </span>
    </TaskItem>
  );
};

export const IntegrationToolTaskGroup = ({
  getToolPresentation,
  parts,
}: IntegrationToolTaskGroupProps) => {
  const hasActiveStep = parts.some(
    (part) =>
      part.state !== "output-available" && part.state !== "output-error",
  );
  const hasError = parts.some(
    (part) => part.state === "output-error" || Boolean(part.errorText),
  );
  const title = hasActiveStep
    ? "Searching connected sources"
    : hasError
      ? "Search finished with errors"
      : parts.length === 1
        ? getToolPresentation(parts[0]!, getStaticToolName(parts[0]!)).title
        : "Searched connected sources";

  return (
    <Task className="not-prose mb-3" defaultOpen={hasActiveStep || hasError}>
      <TaskTrigger title={title} />
      <TaskContent>
        {parts.map((part) => (
          <IntegrationToolTaskItem
            getToolPresentation={getToolPresentation}
            key={part.toolCallId}
            part={part}
          />
        ))}
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
      type: "integration-tools";
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
        const nextPart = parts[nextIndex];

        if (!(isToolUIPart(nextPart) && isDatabaseConfigToolPart(nextPart))) {
          break;
        }

        databaseParts.push(nextPart);
        nextIndex += 1;
      }

      groups.push({
        type: "database-tools",
        startIndex: index,
        parts: databaseParts,
      });
      index = nextIndex - 1;
      continue;
    }

    if (isToolUIPart(part) && isIntegrationToolPart(part)) {
      const integrationParts: ToolPart[] = [part];
      let nextIndex = index + 1;

      while (nextIndex < parts.length) {
        const nextPart = parts[nextIndex];

        if (!(isToolUIPart(nextPart) && isIntegrationToolPart(nextPart))) {
          break;
        }

        integrationParts.push(nextPart);
        nextIndex += 1;
      }

      groups.push({
        type: "integration-tools",
        startIndex: index,
        parts: integrationParts,
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
