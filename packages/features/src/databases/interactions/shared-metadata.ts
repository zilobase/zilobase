import type { SessionEntities } from "../../data/client";
import { entityPreview, type EntityPreview } from "../../data/commands";
import type { DatabaseCommandInput } from "../mutations/execute";
import type { DatabaseBootstrapResponse } from "../core/entities";
import { metadataEffectsForCommand } from "./metadata-command";
import { projectDatabaseMetadata } from "./metadata";
import { applyConfigurationChanges } from "./configuration";

export function sharedMetadataCommand(input: DatabaseCommandInput) {
  return [
    "database.update",
    "dataSource.update",
    "view.update",
    "view.move",
    "property.move",
  ].includes(input.command.type);
}
/** Domain intent creates sparse library mutations; the result is never retained. */
export function sharedMetadataPreviews(
  owner: SessionEntities,
  input: DatabaseCommandInput,
  bootstrap: DatabaseBootstrapResponse | undefined,
): EntityPreview[] {
  if (!bootstrap) return [];
  const effects = metadataEffectsForCommand(input, bootstrap);
  const projected = projectDatabaseMetadata(bootstrap, [{ metadataEffects: effects }]);
  const previews: EntityPreview[] = [];
  for (const effect of effects) {
    if (effect.kind === "database")
      previews.push(
        entityPreview(owner.databases.hosts, effect.id, (draft) => {
          if (typeof effect.patch?.name === "string") draft.name = effect.patch.name;
          if (effect.configuration)
            draft.config = applyConfigurationChanges(draft.config, effect.configuration);
        }),
      );
    if (effect.kind === "source")
      previews.push(
        entityPreview(owner.databases.sources, effect.id, (draft) => {
          if (typeof effect.patch?.name === "string") draft.name = effect.patch.name;
          if (effect.configuration)
            draft.config = applyConfigurationChanges(draft.config, effect.configuration);
        }),
      );
    if (effect.kind === "view") {
      for (const view of projected.views) {
        const before = bootstrap.views.find((before) => before.id === view.id);
        if (JSON.stringify(before) === JSON.stringify(view)) continue;
        previews.push(
          entityPreview(owner.databases.views, view.id, (draft) => {
            draft.position = view.position;
            if (view.id === effect.id) {
              if (typeof effect.patch?.name === "string") draft.name = effect.patch.name;
              if (typeof effect.patch?.type === "string") draft.type = effect.patch.type;
              if (effect.configuration)
                draft.config = applyConfigurationChanges(draft.config, effect.configuration);
            }
          }),
        );
      }
    }
    if (effect.kind === "property" && effect.placement) {
      for (const binding of projected.properties) {
        if (
          bootstrap.properties.find((before) => before.id === binding.id)?.position ===
          binding.position
        )
          continue;
        previews.push(
          entityPreview(owner.databases.bindings, binding.id, (draft) => {
            draft.position = binding.position;
          }),
        );
      }
    }
  }
  return previews;
}
