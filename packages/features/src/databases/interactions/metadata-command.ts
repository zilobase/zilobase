import type { DatabaseCommandInput } from "../mutations/execute";
import type { DatabaseBootstrapResponse } from "../core/entities";
import type { MetadataEffect } from "./metadata";

/** Build only deterministic previews; server-derived transformations stay pending. */
export function metadataEffectsForCommand(
  input: DatabaseCommandInput,
  snapshot: DatabaseBootstrapResponse | undefined,
): MetadataEffect[] {
  const command = input.command;
  const base = { hostId: input.databaseId };
  if (!snapshot) return [];
  switch (command.type) {
    case "database.update": {
      const { configuration, ...patch } = command.patch;
      return [
        {
          ...base,
          kind: "database",
          id: input.databaseId,
          patch,
          ...(configuration !== undefined ? { configuration } : {}),
        },
      ];
    }
    case "dataSource.update": {
      const source = snapshot.dataSources.find(({ id }) => id === input.dataSourceId);
      if (!source) return [];
      const { configuration, ...patch } = command.patch;
      return [
        {
          ...base,
          kind: "source",
          id: source.id,
          dataSourceId: source.id,
          patch,
          ...(configuration !== undefined ? { configuration } : {}),
        },
      ];
    }
    case "view.update": {
      const view = snapshot.views.find(({ id }) => id === command.viewId);
      if (!view) return [];
      const { configuration, ...patch } = command.patch;
      return [
        {
          ...base,
          kind: "view",
          id: view.id,
          patch,
          ...(configuration !== undefined ? { configuration } : {}),
        },
      ];
    }
    case "property.update": {
      const column = snapshot.properties.find(({ id }) => id === command.propertyId);
      if (!column || (command.patch.type && command.patch.type !== column.property.type)) return [];
      const { configuration, visible, width, ...propertyPatch } = command.patch;
      return [
        {
          ...base,
          kind: "property",
          id: column.id,
          dataSourceId: column.dataSourceId,
          propertyPatch,
          patch: {
            ...(visible !== undefined ? { visible } : {}),
            ...(width !== undefined ? { width } : {}),
          },
          ...(configuration !== undefined ? { propertyConfiguration: configuration } : {}),
        },
      ];
    }
    case "property.create": {
      const source = snapshot.dataSources.find(({ id }) => id === input.dataSourceId);
      if (!source) return [];
      const id = `pending-property:${crypto.randomUUID()}`;
      const propertyId = `pending-field:${crypto.randomUUID()}`;
      const properties = snapshot.properties.filter(
        (property) => property.dataSourceId === source.id,
      );
      const before = properties.find(({ id }) => id === command.beforePropertyId);
      const after = properties.find(({ id }) => id === command.afterPropertyId);
      const position = after ? after.position + 1 : (before?.position ?? properties.length);
      const now = new Date().toISOString();
      return [
        {
          ...base,
          kind: "property",
          id,
          dataSourceId: source.id,
          insert: {
            id,
            dataSourceId: source.id,
            propertyId,
            position,
            visible: true,
            width: null,
            createdAt: now,
            updatedAt: now,
            property: {
              id: propertyId,
              name: command.name,
              config: command.config,
              type: command.propertyType,
              workspaceId: source.workspaceId,
              createdAt: now,
              updatedAt: now,
            },
          },
        },
      ];
    }
    default:
      return [];
  }
}
