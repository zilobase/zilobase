import type { SessionEntities } from "../../data/client";
import { entityUpsertPreview, type EntityPreview } from "../../data/commands";
import { pageCacheEntitySchema } from "../../pages/cache-entities";
import {
  valueIdentity,
  recordCacheEntitySchema,
  valueCacheEntitySchema,
} from "../schema/cache-entities";
import type { RecordEffect } from "./model";

/** Temporary identities are library-owned previews; intentions retain only membership. */
export function insertionPreviews(
  owner: Pick<SessionEntities, "session" | "pages" | "databases">,
  effects: readonly RecordEffect[],
): EntityPreview[] {
  const previews: EntityPreview[] = [];
  for (const effect of effects) {
    const record = effect.record;
    if (!record || effect.remove || owner.databases.records.collection.base.has(record.id))
      continue;
    const page = pageCacheEntitySchema.parse({
      ...record.page,
      workspaceId: owner.session.scope.workspaceId,
    });
    if (!owner.pages.collection.has(page.id))
      previews.push(entityUpsertPreview(owner.pages, page, () => {}));
    const values = Object.values(record.valuesByPropertyId).map((value) =>
      valueCacheEntitySchema.parse({
        ...value,
        id: valueIdentity(value.pageId, value.propertyId),
        valueId: value.id,
      }),
    );
    for (const value of values)
      if (!owner.databases.values.collection.has(value.id))
        previews.push(entityUpsertPreview(owner.databases.values, value, () => {}));
    const row = recordCacheEntitySchema.parse({
      id: record.id,
      pageId: record.pageId,
      dataSourceId: record.dataSourceId,
      orderKey: record.orderKey,
      parentRowId: effect.parentRowId ?? record.parentRowId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      valueIds: values.map((value) => value.id),
    });
    previews.push(entityUpsertPreview(owner.databases.records, row, () => {}));
  }
  return previews;
}
