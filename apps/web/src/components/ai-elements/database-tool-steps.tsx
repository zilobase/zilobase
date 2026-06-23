"use client";

import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolPart,
} from "@/components/ai-elements/tool";
import {
  type DatabaseConfigToolName,
  type DatabaseConfigToolOutput,
  isDatabaseConfigToolName,
} from "@notelab/features/ai-chat";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import type { LucideIcon } from "lucide-react";
import {
  Columns3Icon,
  DatabaseIcon,
  FilePlusIcon,
  LayoutTemplateIcon,
  LinkIcon,
  PencilIcon,
  Rows3Icon,
  Settings2Icon,
  TablePropertiesIcon,
} from "lucide-react";

type DatabaseToolStepConfig = {
  activeLabel: string;
  completeLabel: string;
  icon: LucideIcon;
};

const databaseToolStepConfig: Record<DatabaseConfigToolName, DatabaseToolStepConfig> =
  {
    createWorkspace: {
      activeLabel: "Creating workspace",
      completeLabel: "Created workspace",
      icon: FilePlusIcon,
    },
    createDatabase: {
      activeLabel: "Creating database",
      completeLabel: "Created database",
      icon: DatabaseIcon,
    },
    embedDatabaseInPage: {
      activeLabel: "Embedding database in page",
      completeLabel: "Embedded database in page",
      icon: LayoutTemplateIcon,
    },
    linkDatabaseInWorkspace: {
      activeLabel: "Linking database in sidebar",
      completeLabel: "Linked database in sidebar",
      icon: LinkIcon,
    },
    createDatabaseProperty: {
      activeLabel: "Adding database property",
      completeLabel: "Added database property",
      icon: Columns3Icon,
    },
    updateDatabaseProperty: {
      activeLabel: "Updating database property",
      completeLabel: "Updated database property",
      icon: Columns3Icon,
    },
    createDatabaseView: {
      activeLabel: "Creating database view",
      completeLabel: "Created database view",
      icon: TablePropertiesIcon,
    },
    updateDatabaseView: {
      activeLabel: "Updating database view",
      completeLabel: "Updated database view",
      icon: TablePropertiesIcon,
    },
    updateDatabase: {
      activeLabel: "Updating database",
      completeLabel: "Updated database",
      icon: Settings2Icon,
    },
    createDatabaseRow: {
      activeLabel: "Adding database row",
      completeLabel: "Added database row",
      icon: Rows3Icon,
    },
    setDatabaseCellValue: {
      activeLabel: "Setting cell value",
      completeLabel: "Set cell value",
      icon: PencilIcon,
    },
  };

function readToolInputRecord(input: ToolPart["input"]) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  return input as Record<string, unknown>;
}

function readStringField(input: ToolPart["input"], field: string) {
  const record = readToolInputRecord(input);
  const value = record?.[field];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatCellValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).join(", ");
  }

  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }

  return null;
}

function buildDatabaseToolInputDescription(
  toolName: DatabaseConfigToolName,
  input: ToolPart["input"],
) {
  switch (toolName) {
    case "createWorkspace": {
      const name = readStringField(input, "name");
      return name ? `Workspace name: ${name}` : null;
    }
    case "createDatabase": {
      const name = readStringField(input, "name");
      return name ? `Database name: ${name}` : null;
    }
    case "embedDatabaseInPage": {
      const afterHeading = readStringField(input, "afterHeading");
      return afterHeading ? `After heading: ${afterHeading}` : null;
    }
    case "createDatabaseProperty": {
      const name = readStringField(input, "name");
      const type = readStringField(input, "type");
      if (name && type) {
        return `${name} (${type})`;
      }
      return name ?? type;
    }
    case "updateDatabaseProperty": {
      const name = readStringField(input, "name");
      const type = readStringField(input, "type");
      if (name && type) {
        return `${name} (${type})`;
      }
      return name ?? type;
    }
    case "createDatabaseView": {
      const name = readStringField(input, "name");
      const type = readStringField(input, "type");
      if (name && type) {
        return `${name} (${type})`;
      }
      return name ?? type;
    }
    case "updateDatabaseView": {
      const name = readStringField(input, "name");
      return name;
    }
    case "updateDatabase": {
      const name = readStringField(input, "name");
      return name ? `Rename to ${name}` : null;
    }
    case "createDatabaseRow": {
      const title = readStringField(input, "title");
      return title ? `Row title: ${title}` : null;
    }
    case "setDatabaseCellValue": {
      const record = readToolInputRecord(input);
      const value = record ? formatCellValue(record.value) : null;
      return value ? `Value: ${value}` : null;
    }
    default:
      return null;
  }
}

function readDatabaseToolOutput(output: ToolPart["output"]) {
  if (!output || typeof output !== "object") {
    return null;
  }

  const record = output as DatabaseConfigToolOutput;

  if (record.ok !== true || typeof record.summary !== "string") {
    return null;
  }

  return record;
}

function getDatabaseToolStepStatus(
  state: ToolPart["state"],
): "complete" | "active" | "pending" {
  if (state === "output-available" || state === "output-error") {
    return "complete";
  }

  if (state === "input-available" || state === "input-streaming") {
    return "active";
  }

  return "pending";
}

function isDatabaseToolPart(part: ToolPart) {
  return isDatabaseConfigToolName(getToolName(part));
}

function getDatabaseToolStepLabel(
  toolName: DatabaseConfigToolName,
  state: ToolPart["state"],
) {
  const config = databaseToolStepConfig[toolName];
  const isFinished =
    state === "output-available" || state === "output-error";

  return isFinished ? config.completeLabel : config.activeLabel;
}

function getDatabaseToolStepDescription(
  toolName: DatabaseConfigToolName,
  part: ToolPart,
) {
  if (part.errorText) {
    return part.errorText;
  }

  const output = readDatabaseToolOutput(part.output);

  if (output?.summary) {
    return output.summary;
  }

  return buildDatabaseToolInputDescription(toolName, part.input);
}

const DatabaseToolStep = ({
  part,
  toolName,
}: {
  part: ToolPart;
  toolName: DatabaseConfigToolName;
}) => {
  const config = databaseToolStepConfig[toolName];
  const status = getDatabaseToolStepStatus(part.state);
  const description = getDatabaseToolStepDescription(toolName, part);

  return (
    <ChainOfThoughtStep
      description={description ?? undefined}
      icon={config.icon}
      label={getDatabaseToolStepLabel(toolName, part.state)}
      status={status}
    />
  );
};

export const DatabaseToolStepsGroup = ({
  parts,
  showToolOutputUi,
}: {
  parts: ToolPart[];
  showToolOutputUi: boolean;
}) => {
  const hasActiveStep = parts.some(
    (part) =>
      part.state !== "output-available" && part.state !== "output-error",
  );
  const hasError = parts.some(
    (part) => part.state === "output-error" || Boolean(part.errorText),
  );
  const headerLabel = hasActiveStep
    ? "Setting up database"
    : hasError
      ? "Database setup finished with errors"
      : parts.length === 1
        ? "Database change"
        : "Database setup";

  return (
    <div className="not-prose mb-3 space-y-2">
      <ChainOfThought defaultOpen={hasActiveStep || hasError}>
        <ChainOfThoughtHeader>{headerLabel}</ChainOfThoughtHeader>
        <ChainOfThoughtContent>
          {parts.map((part) => {
            const toolName = getToolName(part);

            if (!isDatabaseConfigToolName(toolName)) {
              return null;
            }

            return (
              <DatabaseToolStep
                key={part.toolCallId}
                part={part}
                toolName={toolName}
              />
            );
          })}
        </ChainOfThoughtContent>
      </ChainOfThought>
      {showToolOutputUi
        ? parts.map((part) => {
            const toolName = getToolName(part);
            const title = isDatabaseConfigToolName(toolName)
              ? databaseToolStepConfig[toolName].completeLabel
              : toolName;

            return (
              <Tool
                defaultOpen={part.state !== "output-available"}
                key={part.toolCallId}
              >
                {part.type === "dynamic-tool" ? (
                  <ToolHeader
                    state={part.state}
                    title={title}
                    toolName={part.toolName}
                    type={part.type}
                  />
                ) : (
                  <ToolHeader state={part.state} title={title} type={part.type} />
                )}
                <ToolContent>
                  <ToolInput input={part.input} />
                  <ToolOutput errorText={part.errorText} output={part.output} />
                </ToolContent>
              </Tool>
            );
          })
        : null}
    </div>
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
    };

export function buildMessagePartGroups(
  parts: UIMessage["parts"],
): MessagePartGroup[] {
  const groups: MessagePartGroup[] = [];

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];

    if (isToolUIPart(part) && isDatabaseToolPart(part)) {
      const databaseParts: ToolPart[] = [part];
      let nextIndex = index + 1;

      while (nextIndex < parts.length) {
        const nextPart = parts[nextIndex];

        if (!(isToolUIPart(nextPart) && isDatabaseToolPart(nextPart))) {
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

    groups.push({
      type: "part",
      index,
      part,
    });
  }

  return groups;
}

export function isDatabaseConfigToolPart(part: UIMessage["parts"][number]) {
  return isToolUIPart(part) && isDatabaseToolPart(part);
}