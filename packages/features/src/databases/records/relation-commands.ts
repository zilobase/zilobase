import type { useAddDatabaseProperty, useUpdateDatabaseProperty } from "../mutations/properties";
import type { useUpdateDatabasePropertyValue } from "../mutations/rows";
import { diffConfiguration } from "../interactions/configuration";
import { getRelationConfig } from "../schema/relation-settings";
import {
  getRelationRepairMutationPlan,
  getRelationSelectionChange,
  getRelationTwoWayConfigUpdate,
} from "../schema/relations";
import type { DatabaseViewData } from "../views/source-state";
import type { DatabasePropertyValue } from "../schema/property-values";
import type { DatabasePropertyConfig } from "../views/configuration";
import { planRelationSave, type RelationSaveInput } from "../planners/relations";

export function createDatabaseRelationCommands(mutations: {
  addProperty: Pick<ReturnType<typeof useAddDatabaseProperty>, "mutate">;
  updateProperty: Pick<ReturnType<typeof useUpdateDatabaseProperty>, "mutate">;
  updateValue: Pick<ReturnType<typeof useUpdateDatabasePropertyValue>, "mutate">;
}) {
  const { addProperty, updateProperty, updateValue } = mutations;
  return {
    repair(input: Parameters<typeof getRelationRepairMutationPlan>[0]) {
      const plan = getRelationRepairMutationPlan(input);
      if (!plan) return false;
      plan.valueUpdates.forEach((update) =>
        updateValue.mutate({
          databaseId: update.databaseId,
          propertyId: update.propertyId,
          rowId: update.rowId,
          value: update.value,
        }),
      );
      plan.configUpdates.forEach((update) => updateProperty.mutate(update));
      return true;
    },
    save(input: RelationSaveInput, onUpdateConfig: (config: DatabasePropertyConfig) => void) {
      const plan = planRelationSave(input);
      if (!plan) return;
      if (!plan.reciprocal) {
        onUpdateConfig(plan.config());
        return;
      }
      addProperty.mutate(plan.reciprocal, {
        onSuccess: (reciprocalProperty) =>
          onUpdateConfig(plan.config(reciprocalProperty.property.id)),
      });
    },
    setTwoWay(
      input: Parameters<typeof getRelationTwoWayConfigUpdate>[0] & {
        relationConfig: ReturnType<typeof getRelationConfig>;
        relatedPropertyName: string;
      },
      onUpdateConfig: (config: DatabasePropertyConfig) => void,
    ) {
      const update = getRelationTwoWayConfigUpdate(input);
      if (update) updateProperty.mutate(update);
      onUpdateConfig({
        relation: {
          ...input.relationConfig,
          relatedPropertyName: input.relatedPropertyName.trim() || undefined,
          twoWayRelation: input.nextTwoWayRelation,
        },
      });
    },
  };
}

export function applyDatabaseRelationSelection(
  mutations: {
    updateProperty: Pick<ReturnType<typeof useUpdateDatabaseProperty>, "mutate">;
    updateValue: Pick<ReturnType<typeof useUpdateDatabasePropertyValue>, "mutate">;
  },
  input: Parameters<typeof getRelationSelectionChange>[0] & {
    relatedViewData: DatabaseViewData | null | undefined;
    onPropertyConfigChange?: (config: unknown) => unknown;
    onSelect: (value: DatabasePropertyValue) => void;
  },
) {
  const { updateProperty, updateValue } = mutations;
  const { value, config, reciprocalUpdates } = getRelationSelectionChange(input);
  void input.onPropertyConfigChange?.(config);
  input.onSelect(value);
  reciprocalUpdates.forEach((update) => {
    if (update.config && update.databasePropertyId)
      updateProperty.mutate({
        configuration: diffConfiguration(
          input.relatedViewData?.bootstrap.properties.find(
            ({ id }) => id === update.databasePropertyId,
          )?.property.config,
          update.config,
        ),
        databaseId: update.databaseId,
        databasePropertyId: update.databasePropertyId,
      });
    updateValue.mutate({
      databaseId: update.databaseId,
      propertyId: update.propertyId,
      rowId: update.rowId,
      value: update.value,
    });
  });
}
