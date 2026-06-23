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
import { isProposePageContentUpdateToolName } from "@notelab/features/ai-chat";
import { isDatabaseConfigToolPart } from "@/components/ai-elements/database-tool-steps";
import { useEffect, useState, type ReactNode } from "react";

type IntegrationToolTaskGroupProps = {
  getToolPhrases: (toolName: string) => string[];
  getToolTitle: (toolName: string) => string;
  getToolSource: (toolName: string) => keyof typeof integrationIcons | undefined;
  parts: ToolPart[];
  renderGenerativeOutput?: (part: ToolPart, toolName: string) => ReactNode;
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
  getToolPhrases,
  getToolSource,
  getToolTitle,
  part,
  renderGenerativeOutput,
}: {
  getToolPhrases: (toolName: string) => string[];
  getToolSource: (toolName: string) => keyof typeof integrationIcons | undefined;
  getToolTitle: (toolName: string) => string;
  part: ToolPart;
  renderGenerativeOutput?: (part: ToolPart, toolName: string) => ReactNode;
}) => {
  const toolName = getStaticToolName(part);
  const title = getToolTitle(toolName);
  const source = getToolSource(toolName);
  const phrases = getToolPhrases(toolName);
  const finishedLabel = finishedLabels[part.state];
  const isRunning =
    !finishedLabel &&
    (part.state === "input-available" || part.state === "input-streaming");
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    if (!isRunning || phrases.length < 2) {
      return;
    }

    const interval = window.setInterval(() => {
      setPhraseIndex((index) => (index + 1) % phrases.length);
    }, 1700);

    return () => {
      window.clearInterval(interval);
    };
  }, [isRunning, phrases.length]);

  const statusText = part.errorText
    ? part.errorText
    : finishedLabel
      ? `${finishedLabel}: ${title}`
      : phrases[phraseIndex % phrases.length] ?? `Running ${title}`;

  const generativeOutput = renderGenerativeOutput?.(part, toolName);

  return (
    <div className="space-y-2">
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
      {generativeOutput ? (
        <div className="pl-6">{generativeOutput}</div>
      ) : null}
    </div>
  );
};

export const IntegrationToolTaskGroup = ({
  getToolPhrases,
  getToolSource,
  getToolTitle,
  parts,
  renderGenerativeOutput,
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
        ? getToolTitle(getStaticToolName(parts[0]!))
        : "Searched connected sources";

  return (
    <Task className="not-prose mb-3" defaultOpen={hasActiveStep || hasError}>
      <TaskTrigger title={title} />
      <TaskContent>
        {parts.map((part) => (
          <IntegrationToolTaskItem
            getToolPhrases={getToolPhrases}
            getToolSource={getToolSource}
            getToolTitle={getToolTitle}
            key={part.toolCallId}
            part={part}
            renderGenerativeOutput={renderGenerativeOutput}
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