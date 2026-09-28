import type { DatabaseRecordEntity } from "../core/entities";
import type { MetadataIntention } from "./metadata";
import type { DatabaseOperationStatus } from "../core/lifecycle-commands";

export type RowPlacement = { afterRowId: string | null; beforeRowId: string | null };

/** A sparse intention, never a replacement of a cached server snapshot. */
export type RecordEffect = {
  dataSourceId: string;
  rowId: string;
  record?: DatabaseRecordEntity;
  remove?: boolean;
  placement?: RowPlacement;
  title?: string;
  parentRowId?: string | null;
  values?: Record<string, unknown>;
};

export type DatabaseIntention = MetadataIntention & {
  id: string;
  effects: readonly RecordEffect[];
  status: DatabaseOperationStatus;
  /** Source clocks work across linked hosts without disclosing their identities. */
  sourceVersions?: Readonly<Record<string, number>>;
};

export function interactionAffectsSource(interaction: DatabaseIntention, dataSourceId: string) {
  return interaction.effects.some((effect) => effect.dataSourceId === dataSourceId);
}

export function needsProjection(
  interaction: DatabaseIntention,
  dataSourceId: string,
  sourceVersion: number | null,
) {
  if (!interactionAffectsSource(interaction, dataSourceId)) return false;
  const confirmed = interaction.sourceVersions?.[dataSourceId];
  return confirmed === undefined || sourceVersion === null || sourceVersion < confirmed;
}

/** Rebase intentions in submission order; rejecting one does not roll back another. */
export function projectRecordInteractions(
  records: DatabaseRecordEntity[],
  interactions: readonly DatabaseIntention[],
  scope: { dataSourceId: string; sourceVersion: number | null },
): DatabaseRecordEntity[] {
  let result = records;
  for (const interaction of interactions) {
    if (!needsProjection(interaction, scope.dataSourceId, scope.sourceVersion)) continue;
    for (const effect of interaction.effects) {
      if (effect.dataSourceId !== scope.dataSourceId) continue;
      const current = result.find(({ id }) => id === effect.rowId) ?? effect.record;
      if (effect.remove) {
        result = result.filter(({ id }) => id !== effect.rowId);
        continue;
      }
      if (!current) continue;
      let next = current;
      if (effect.title !== undefined)
        next = { ...next, page: { ...next.page, name: effect.title } };
      if (effect.parentRowId !== undefined) next = { ...next, parentRowId: effect.parentRowId };
      if (effect.values) {
        const valuesByPropertyId = { ...next.valuesByPropertyId };
        for (const [propertyId, value] of Object.entries(effect.values)) {
          valuesByPropertyId[propertyId] = {
            ...(valuesByPropertyId[propertyId] ?? {
              id: `draft:${effect.rowId}:${propertyId}`,
              createdAt: next.updatedAt,
              updatedAt: next.updatedAt,
            }),
            pageId: next.pageId,
            propertyId,
            value,
          };
        }
        next = { ...next, valuesByPropertyId };
      }
      const index = result.findIndex(({ id }) => id === effect.rowId);
      result = result.slice();
      if (index >= 0) result[index] = next;
      else result.push(next);
      if (effect.placement) {
        result = result.filter(({ id }) => id !== effect.rowId);
        const after = result.findIndex(({ id }) => id === effect.placement!.afterRowId);
        const before = result.findIndex(({ id }) => id === effect.placement!.beforeRowId);
        // Match the server's full-order anchor policy, including hidden rows.
        const destination = after >= 0 ? after + 1 : before >= 0 ? before : result.length;
        result.splice(destination, 0, next);
      }
    }
  }
  return result;
}

/** Apply a create acknowledgement to every queued reference, not only its own preview. */
export function remapRecordIdentity(
  interaction: DatabaseIntention,
  temporaryId: string,
  record: DatabaseRecordEntity,
  temporaryPageId?: string,
): DatabaseIntention {
  const map = (id: string | null) => (id === temporaryId ? record.id : id);
  return {
    ...interaction,
    effects: interaction.effects.map((effect) => ({
      ...effect,
      rowId: map(effect.rowId)!,
      ...(effect.record?.id === temporaryId
        ? { record }
        : effect.record && temporaryPageId && effect.record.pageId === temporaryPageId
          ? {
              record: {
                ...effect.record,
                pageId: record.pageId,
                page: { ...effect.record.page, id: record.pageId },
              },
            }
          : {}),
      ...(effect.values && temporaryPageId
        ? {
            values: Object.fromEntries(
              Object.entries(effect.values).map(([key, value]) => [
                key,
                Array.isArray(value)
                  ? value.map((id) => (id === temporaryPageId ? record.pageId : id))
                  : value === temporaryPageId
                    ? record.pageId
                    : value,
              ]),
            ),
          }
        : {}),
      ...(effect.parentRowId !== undefined ? { parentRowId: map(effect.parentRowId) } : {}),
      ...(effect.placement
        ? {
            placement: {
              afterRowId: map(effect.placement.afterRowId),
              beforeRowId: map(effect.placement.beforeRowId),
            },
          }
        : {}),
    })),
  };
}
