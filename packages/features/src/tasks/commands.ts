import type { DatabaseExportPayload } from "../databases/core/export-payload";
import { createDatabase } from "../databases/mutations/databases-operations";
import { applyDatabaseTemplate } from "../databases/mutations/properties-operations";
import type { DatabaseSetupSelection } from "../databases/planners/sources";
import { defaultStatusOptions } from "../databases/schema/property-defaults";
import type { DatabasePropertyValue } from "../databases/schema/property-values";
import { serializePropertyValue } from "../databases/schema/property-values";
import { getDatabaseSetupTemplate } from "../databases/templates/definitions";
import { createSampleRowContent } from "../databases/templates/sample-content";
import { getMergedDatabaseConfig } from "../databases/views/configuration";
import { captureClientOperation, type ClientOperationContext } from "../shared/operation-context";
import { getTaskDatabaseSchema, getTaskStatusForCompletion, type TaskRow } from "./model";
import { ASSIGNEE_PROPERTY_ID, DUE_DATE_PROPERTY_ID, STATUS_PROPERTY_ID } from "./view-data";
export class TaskDatabaseSetupError extends Error {
  constructor(
    cause: unknown,
    readonly created: Awaited<ReturnType<typeof createDatabase>>,
  ) {
    super(cause instanceof Error ? cause.message : "Could not finish creating the task database.", {
      cause,
    });
    this.name = "TaskDatabaseSetupError";
  }
}
export async function createTaskDatabase(
  context: ClientOperationContext,
  {
    saveTaskDatabaseIds,
    selection,
    selectedDatabaseIds,
    workspaceId,
  }: {
    saveTaskDatabaseIds: (databaseIds: string[]) => Promise<void>;
    selection: DatabaseSetupSelection;
    selectedDatabaseIds: string[];
    workspaceId: string | null | undefined;
  },
) {
  const scope = captureClientOperation(context);
  if (!workspaceId) throw new Error("Choose a workspace first.");

  if (selection.sourceView) {
    if (selectedDatabaseIds.includes(selection.sourceView.parentDatabaseId)) {
      return {
        status: "already-connected" as const,
        databaseId: selection.sourceView.parentDatabaseId,
      };
    }

    await saveTaskDatabaseIds(
      [...selectedDatabaseIds, selection.sourceView.parentDatabaseId].slice(0, 10),
    );
    return { status: "linked" as const, databaseId: selection.sourceView.parentDatabaseId };
  }

  const template = selection.templateId ? getDatabaseSetupTemplate(selection.templateId) : null;
  const name = selection.databaseName || template?.name || "New data source";
  const payload = await createDatabase(context, {
    name,
    standalone: true,
    workspaceId,
  });
  try {
    scope.assertCurrent();
    const requiredProperties = [
      {
        config: {
          defaultOptionId: defaultStatusOptions[0]?.id,
          options: defaultStatusOptions,
        },
        name: "Status",
        type: "status",
      },
      {
        config: { personLimit: "one_person" },
        name: "Assignee",
        type: "person",
      },
      { name: "Due date", type: "date" },
    ];
    const templateProperties = template?.properties ?? [];
    const templatePropertyTypes = new Set(templateProperties.map((property) => property.type));
    const properties = [
      ...templateProperties,
      ...requiredProperties.filter((property) => !templatePropertyTypes.has(property.type)),
    ];
    const propertyTypesByName = new Map(
      properties.map((property) => [property.name.toLowerCase(), property.type]),
    );

    if (!payload.activeDataSource) throw new Error("Created task database has no active source");
    await applyDatabaseTemplate(context, {
      config: getMergedDatabaseConfig(payload.database.config, {
        emoji: template?.emoji ?? "✅",
        setupDismissed: true,
      }),
      databaseId: payload.activeDataSource.id,
      hostDatabaseId: payload.database.id,
      name,
      properties,
      rows: (template?.sampleRows ?? []).map((sampleRow) => ({
        content: createSampleRowContent(sampleRow.content),
        metadata: { emoji: sampleRow.emoji },
        title: sampleRow.title,
        values: Object.entries(sampleRow.values ?? {}).flatMap(([propertyName, value]) => {
          const propertyType = propertyTypesByName.get(propertyName.toLowerCase());

          return propertyType
            ? [
                {
                  propertyName,
                  value: serializePropertyValue(propertyType, value),
                },
              ]
            : [];
        }),
      })),
    });
    scope.assertCurrent();
    await saveTaskDatabaseIds([...selectedDatabaseIds, payload.database.id].slice(0, 10));
    return {
      status: "created" as const,
      databaseId: payload.database.id,
      dataSourceId: payload.activeDataSource.id,
      result: payload,
    };
  } catch (cause) {
    throw new TaskDatabaseSetupError(cause, payload);
  }
}

export function getTaskPropertyUpdate(
  task: TaskRow | undefined,
  payload: DatabaseExportPayload | null | undefined,
  propertyId: string,
  nextValue: DatabasePropertyValue,
) {
  if (!task || !payload) return null;
  const schema = getTaskDatabaseSchema(payload);
  const property =
    propertyId === STATUS_PROPERTY_ID
      ? schema.status
      : propertyId === ASSIGNEE_PROPERTY_ID
        ? schema.assignee
        : propertyId === DUE_DATE_PROPERTY_ID
          ? schema.dueDate
          : null;
  if (!property) return null;
  return {
    databaseId: payload.activeDataSource?.id ?? task.databaseId,
    hostDatabaseId: payload.database.id,
    propertyId: property.property.id,
    rowId: task.rowId,
    value: nextValue || null,
  };
}

export function getTaskCreationInput(
  payload: DatabaseExportPayload | undefined,
  currentUserId: string | null,
) {
  if (!payload) return null;
  const schema = getTaskDatabaseSchema(payload);
  if (!schema.status || !schema.assignee) return null;
  const initialStatus = getTaskStatusForCompletion(payload, false);
  return {
    databaseId: payload.activeDataSource?.id ?? payload.database.id,
    hostDatabaseId: payload.database.id,
    initialValues: [
      ...(currentUserId
        ? [{ propertyId: schema.assignee.property.id, value: [currentUserId] }]
        : []),
      ...(initialStatus ? [{ propertyId: schema.status.property.id, value: initialStatus }] : []),
    ],
  };
}

export function getTaskCompletionUpdate(
  task: TaskRow | undefined,
  payload: DatabaseExportPayload | null | undefined,
  complete: boolean,
) {
  const property = payload ? getTaskDatabaseSchema(payload).status : null;
  const status = payload ? getTaskStatusForCompletion(payload, complete) : null;
  if (!task || !property || !status) return null;
  return {
    databaseId: payload?.activeDataSource?.id ?? task.databaseId,
    hostDatabaseId: payload?.database.id,
    propertyId: property.property.id,
    rowId: task.rowId,
    value: status,
  };
}
