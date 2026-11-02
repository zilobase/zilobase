import type { AddDatabasePropertyInput } from "../mutations/properties-operations";
import type { getRelationConfig } from "../schema/relation-settings";
import type { DatabasePropertyConfig } from "../views/configuration";

export type RelationSaveInput = {
  selectedDatabase: { value: string; label: string; pageName: string } | null | undefined;
  relationConfig: ReturnType<typeof getRelationConfig>;
  relatedPropertyName: string;
  twoWayRelation: boolean;
  limit: string;
  sourceDatabaseId: string;
  sourceDatabaseName?: string;
  sourcePropertyId?: string;
};

/**
 * Decides how a relation property is saved: either a direct configuration
 * update, or a reciprocal property in the related source first, whose ID is
 * then recorded in the source property's configuration.
 */
export function planRelationSave(input: RelationSaveInput): {
  reciprocal?: Omit<AddDatabasePropertyInput, "onOptimistic">;
  config: (reciprocalPropertyId?: string) => DatabasePropertyConfig;
} | null {
  const { selectedDatabase, relatedPropertyName, twoWayRelation, sourcePropertyId } = input;
  if (!selectedDatabase) return null;
  const relation = {
    ...input.relationConfig,
    relatedDatabaseId: selectedDatabase.value,
    relatedDatabaseName: selectedDatabase.label,
    relatedPageName: selectedDatabase.pageName,
    relatedPropertyName: relatedPropertyName.trim() || undefined,
    twoWayRelation,
  };
  if (!twoWayRelation || !relatedPropertyName.trim() || !sourcePropertyId)
    return { config: () => ({ relation }) };
  return {
    reciprocal: {
      config: {
        relation: {
          limit: input.limit,
          relatedDatabaseId: input.sourceDatabaseId,
          relatedDatabaseName: input.sourceDatabaseName,
          relatedPropertyId: sourcePropertyId,
          twoWayRelation: true,
        },
      },
      databaseId: selectedDatabase.value,
      name: relatedPropertyName.trim(),
      type: "relation",
    },
    config: (reciprocalPropertyId) => ({
      relation: { ...relation, relatedPropertyId: reciprocalPropertyId },
    }),
  };
}
