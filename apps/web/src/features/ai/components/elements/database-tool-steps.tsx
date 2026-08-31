"use client";

import { Fragment } from "react";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "./chain-of-thought";
import type { ToolPart } from "./tool";
import {
  type AgentProgressSnapshot,
  type DatabaseConfigToolName,
  type DatabaseConfigToolOutput,
  isDatabaseConfigToolName,
  readDatabaseConfigToolIds,
} from "@zilobase/features/ai-chat";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { Button } from "@/shared/ui/button";
import type { Icon } from "@/shared/components/icons";
import {
  Columns3Icon,
  DatabaseIcon,
  FilePlusIcon,
  LayoutTemplateIcon,
  LinkIcon,
  PencilIcon,
  Rows3Icon,
  RotateCcwIcon,
  Settings2Icon,
  TablePropertiesIcon,
} from "@/shared/components/icons";

type DatabaseToolStepConfig = {
  activeLabel: string;
  completeLabel: string;
  icon: Icon;
};

const databaseToolStepConfig: Record<DatabaseConfigToolName, DatabaseToolStepConfig> =
  {
    buildDatabaseFromBlueprint: {
      activeLabel: "Building database",
      completeLabel: "Built database",
      icon: DatabaseIcon,
    },
    createPage: {
      activeLabel: "Creating page",
      completeLabel: "Created page",
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
    linkDatabaseInPage: {
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
    updateDataSource: {
      activeLabel: "Updating data source",
      completeLabel: "Updated data source",
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
    case "buildDatabaseFromBlueprint": {
      const name = readStringField(input, "databaseName");
      const placement = readStringField(input, "placement");
      return name
        ? `Database: ${name}${placement ? ` (${placement})` : ""}`
        : placement;
    }
    case "createPage": {
      const name = readStringField(input, "name");
      return name ? `Page name: ${name}` : null;
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
    case "updateDataSource": {
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

  if (typeof record.summary !== "string") {
    return null;
  }

  return record;
}

function readBlueprintOutputDetails(output: DatabaseConfigToolOutput) {
  if (!output.data || typeof output.data !== "object" || Array.isArray(output.data)) {
    return null;
  }

  const data = output.data as Record<string, unknown>;
  const properties = Array.isArray(data.properties)
    ? data.properties.flatMap((property) => {
        if (!property || typeof property !== "object" || Array.isArray(property)) {
          return [];
        }
        const value = property as Record<string, unknown>;
        return typeof value.name === "string" && typeof value.type === "string"
          ? [`${value.name} (${value.type})`]
          : [];
      }).slice(0, 30)
    : [];
  const views = Array.isArray(data.views)
    ? data.views.flatMap((view) => {
        if (!view || typeof view !== "object" || Array.isArray(view)) {
          return [];
        }
        const value = view as Record<string, unknown>;
        return typeof value.name === "string" && typeof value.type === "string"
          ? [`${value.name} (${value.type})`]
          : [];
      }).slice(0, 10)
    : [];
  const details = [
    data.placement === "standalone"
      ? "Placement: full-page database"
      : data.placement === "inline"
        ? "Placement: inline database"
        : null,
    data.placement === "inline" &&
        typeof data.showInlineDatabaseTitle === "boolean"
      ? `Inline title: ${data.showInlineDatabaseTitle ? "shown" : "hidden (page title used)"}`
      : null,
    properties.length > 0 ? `Properties: ${properties.join(", ")}` : null,
    views.length > 0 ? `Views: ${views.join(", ")}` : null,
    typeof data.rowCount === "number" ? `Rows: ${data.rowCount}` : null,
  ].filter((detail): detail is string => Boolean(detail));

  return details.length > 0 ? details.join(" · ") : null;
}

function readBlueprintOutputSteps(output: ToolPart["output"]) {
  const toolOutput = readDatabaseToolOutput(output);
  if (
    !toolOutput?.data ||
    typeof toolOutput.data !== "object" ||
    Array.isArray(toolOutput.data)
  ) {
    return [];
  }

  const steps = (toolOutput.data as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) {
    return [];
  }

  return steps.flatMap((step) => {
    if (!step || typeof step !== "object" || Array.isArray(step)) {
      return [];
    }
    const value = step as Record<string, unknown>;
    if (
      typeof value.label !== "string" ||
      typeof value.detail !== "string" ||
      (value.status !== "completed" && value.status !== "failed")
    ) {
      return [];
    }
    return [{
      detail: value.detail,
      label: value.label,
      status: value.status,
    }];
  }).slice(0, 100);
}

function buildIncompleteDatabaseRetryPrompt(
  part: ToolPart,
  progress?: AgentProgressSnapshot,
) {
  const ids = readDatabaseConfigToolIds(part.output);
  const outputSteps = readBlueprintOutputSteps(part.output);
  const steps = progress?.steps ?? outputSteps;
  const completedSteps = steps
    .filter((step) => step.status === "completed")
    .map((step) => step.label);
  const failedSteps = steps
    .filter((step) => step.status === "failed")
    .map((step) => `${step.label}${step.detail ? `: ${step.detail}` : ""}`);
  const databaseName = readStringField(part.input, "databaseName");
  const existingIds = Object.entries(ids ?? {})
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([key, value]) => `${key}=${value}`);

  return [
    `Continue the incomplete${databaseName ? ` “${databaseName}”` : ""} database setup.`,
    existingIds.length > 0
      ? `Use these existing resources: ${existingIds.join(", ")}.`
      : "Inspect the completed tool result to find the existing resources.",
    completedSteps.length > 0
      ? `Already completed: ${completedSteps.join(", ")}.`
      : null,
    failedSteps.length > 0 ? `Failed or incomplete: ${failedSteps.join("; ")}.` : null,
    "Resume from the failed step with low-level database tools. Preserve all completed work and never recreate an existing page or database container.",
  ].filter((value): value is string => Boolean(value)).join(" ");
}

function getDatabaseToolStepStatus(
  state: ToolPart["state"],
): "complete" | "active" | "failed" | "pending" {
  if (state === "output-error") return "failed";
  if (state === "output-available") {
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
  part: ToolPart,
  progress?: AgentProgressSnapshot,
) {
  const config = databaseToolStepConfig[toolName];
  if (part.state === "output-error" || part.errorText) {
    return toolName === "buildDatabaseFromBlueprint"
      ? "Database build attempt failed"
      : "Database change failed";
  }
  if (progress?.status === "failed") {
    return "Database setup incomplete";
  }
  if (progress?.status === "succeeded") {
    return config.completeLabel;
  }
  const isFinished = part.state === "output-available";

  if (isFinished && readDatabaseToolOutput(part.output)?.ok === false) {
    return "Database setup incomplete";
  }

  return isFinished ? config.completeLabel : config.activeLabel;
}

function getDatabaseToolStepDescription(
  toolName: DatabaseConfigToolName,
  part: ToolPart,
) {
  if (part.errorText) {
    return describeDatabaseToolError(part);
  }

  const output = readDatabaseToolOutput(part.output);

  if (output?.summary) {
    const details = toolName === "buildDatabaseFromBlueprint"
      ? readBlueprintOutputDetails(output)
      : null;
    return details ? `${output.summary} ${details}` : output.summary;
  }

  return buildDatabaseToolInputDescription(toolName, part.input);
}

function describeDatabaseToolError(part: ToolPart) {
  const errorText = part.errorText ?? "";
  if (!/Type validation failed/i.test(errorText)) return errorText;

  const propertyIconPath = errorText.match(
    /"path"\s*:\s*\[\s*"properties"\s*,\s*(\d+)\s*,\s*"icon"\s*\]/,
  );
  const propertyIndex = propertyIconPath
    ? Number(propertyIconPath[1])
    : Number.NaN;
  const input = readToolInputRecord(part.input);
  const properties = Array.isArray(input?.properties) ? input.properties : [];
  const property = Number.isInteger(propertyIndex)
    ? properties[propertyIndex]
    : null;

  if (property && typeof property === "object" && !Array.isArray(property)) {
    const record = property as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name : "property";
    const icon = typeof record.icon === "string" ? record.icon : "unknown";
    return `Unsupported icon “${icon}” for “${name}”. This attempt was rejected before any database changes.`;
  }

  return "The generated database input was rejected before execution.";
}

function isFailedDatabaseToolPart(
  part: ToolPart,
  progressByToolCallId?: Map<string, AgentProgressSnapshot>,
) {
  return (
    progressByToolCallId?.get(part.toolCallId)?.status === "failed" ||
    part.state === "output-error" ||
    Boolean(part.errorText) ||
    readDatabaseToolOutput(part.output)?.ok === false
  );
}

function isSuccessfulDatabaseToolPart(
  part: ToolPart,
  progressByToolCallId?: Map<string, AgentProgressSnapshot>,
) {
  const progress = progressByToolCallId?.get(part.toolCallId);
  return progress?.status === "succeeded" ||
    (part.state === "output-available" &&
      readDatabaseToolOutput(part.output)?.ok !== false);
}

const DatabaseToolStep = ({
  part,
  progress,
  toolName,
}: {
  part: ToolPart;
  progress?: AgentProgressSnapshot;
  toolName: DatabaseConfigToolName;
}) => {
  const config = databaseToolStepConfig[toolName];
  const status = progress
    ? progress.status === "running"
      ? "active"
      : progress.status === "failed"
        ? "failed"
        : "complete"
    : readDatabaseToolOutput(part.output)?.ok === false
      ? "failed"
      : getDatabaseToolStepStatus(part.state);
  const baseDescription = getDatabaseToolStepDescription(toolName, part);
  const description = progress?.rowProgress
    ? `${progress.rowProgress.completed} of ${progress.rowProgress.total} rows${baseDescription ? ` · ${baseDescription}` : ""}`
    : part.state === "input-streaming"
      ? "Preparing the tool input"
      : baseDescription;

  return (
    <ChainOfThoughtStep
      description={description ?? undefined}
      icon={config.icon}
      label={getDatabaseToolStepLabel(toolName, part, progress)}
      status={status}
    />
  );
};

export const DatabaseToolStepsGroup = ({
  onRetryIncomplete,
  parts,
  progressByToolCallId,
}: {
  onRetryIncomplete?: (prompt: string) => void | Promise<void>;
  parts: ToolPart[];
  progressByToolCallId?: Map<string, AgentProgressSnapshot>;
}) => {
  const hasActiveStep = parts.some(
    (part) => {
      const progress = progressByToolCallId?.get(part.toolCallId);
      return progress
        ? progress.status === "running"
        : part.state !== "output-available" && part.state !== "output-error";
    },
  );
  const failedPartIndexes = parts.flatMap((part, index) =>
    isFailedDatabaseToolPart(part, progressByToolCallId) ? [index] : []
  );
  const hasError = failedPartIndexes.length > 0;
  const hasUnrecoveredError = failedPartIndexes.some((failedIndex) => {
    const failedToolName = getToolName(parts[failedIndex]!);
    return !parts.slice(failedIndex + 1).some((candidate) =>
      getToolName(candidate) === failedToolName &&
      isSuccessfulDatabaseToolPart(candidate, progressByToolCallId)
    );
  });
  const recoveredAfterRetry = hasError && !hasUnrecoveredError;
  const headerLabel = hasActiveStep
    ? "Setting up database"
    : hasUnrecoveredError
      ? "Database setup finished with errors"
      : recoveredAfterRetry
        ? "Database setup completed after retry"
      : parts.length === 1
        ? "Database change"
        : "Database setup";

  return (
    <div className="not-prose mb-3 space-y-2">
      <ChainOfThought defaultOpen={hasActiveStep || hasUnrecoveredError}>
        <ChainOfThoughtHeader>{headerLabel}</ChainOfThoughtHeader>
        <ChainOfThoughtContent>
          {parts.map((part) => {
            const toolName = getToolName(part);

            if (!isDatabaseConfigToolName(toolName)) {
              return null;
            }

            const progress = progressByToolCallId?.get(part.toolCallId);
            const blueprintSteps = progress?.steps ??
              (toolName === "buildDatabaseFromBlueprint"
                ? readBlueprintOutputSteps(part.output)
                : []);
            const canRetry =
              toolName === "buildDatabaseFromBlueprint" &&
              Boolean(onRetryIncomplete) &&
              (progress?.status === "failed" ||
                readDatabaseToolOutput(part.output)?.ok === false);

            return (
              <Fragment key={part.toolCallId}>
                <DatabaseToolStep
                  part={part}
                  progress={progress}
                  toolName={toolName}
                />
                {blueprintSteps.map((step, index) => (
                  <ChainOfThoughtStep
                    description={step.detail}
                    icon={DatabaseIcon}
                    key={`${part.toolCallId}-${"key" in step ? step.key : index}`}
                    label={step.status === "failed"
                      ? `${step.label} (failed)`
                      : step.label}
                    status={step.status === "running"
                      ? "active"
                      : step.status === "pending"
                        ? "pending"
                        : step.status === "failed"
                          ? "failed"
                          : "complete"}
                  />
                ))}
                {canRetry ? (
                  <div className="pl-7 pt-1">
                    <Button
                      onClick={() =>
                        void onRetryIncomplete?.(
                          buildIncompleteDatabaseRetryPrompt(part, progress),
                        )
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <RotateCcwIcon aria-hidden="true" className="size-3.5" />
                      Retry incomplete setup
                    </Button>
                  </div>
                ) : null}
              </Fragment>
            );
          })}
        </ChainOfThoughtContent>
      </ChainOfThought>
    </div>
  );
};

export function isDatabaseConfigToolPart(part: UIMessage["parts"][number]) {
  return isToolUIPart(part) && isDatabaseToolPart(part);
}
