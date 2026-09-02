import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { RuntimeEnv } from "../../../shared/config/config";
import { db } from "../../../infrastructure/database";

import {
  databaseProperty,
  databaseRow,
  page,
  pageProperty,
  pagePropertyValue,
} from "../../../infrastructure/database/schema";
import { requireDataSourceAccess } from "../access/data-source-access";
import { commitDataSourceMutation } from "../core/commit";
import { validateCellValue } from "../properties/config";
import { lockDatabaseAutomationFactRows } from "./event-capture";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";

export type ResolvedAutomationPropertyOperation = {
  mode: "add" | "clear" | "remove" | "set";
  propertyId: string;
  value?: unknown;
};

export async function applyDatabaseAutomationRowOperations(input: {
  actorId: string;
  dataSourceId: string;
  env?: RuntimeEnv;
  operations: ResolvedAutomationPropertyOperation[];
  rows: Array<{ pageId: string; rowId: string }>;
  runId: string;
}) {
  if (input.rows.length > 1_000) {
    throw new ServiceMutationError("Automation actions can edit at most 1,000 rows", 400);
  }
  const source = await requireDataSourceAccess(input.dataSourceId, input.actorId, "edit");
  const propertyIds = [...new Set(
    input.operations
      .map((operation) => operation.propertyId)
      .filter((propertyId) => propertyId !== "name"),
  )];
  const properties = propertyIds.length
    ? await db
          .select({ config: pageProperty.config, id: pageProperty.id, type: pageProperty.type })
          .from(databaseProperty)
          .innerJoin(pageProperty, eq(pageProperty.id, databaseProperty.propertyId))
          .where(
            and(
              eq(databaseProperty.dataSourceId, source.id),
              inArray(pageProperty.id, propertyIds),
              isNull(pageProperty.deletedAt),
            ),
          )
    : [];
  const propertiesById = new Map(properties.map((property) => [property.id, property]));
  if (propertiesById.size !== propertyIds.length) {
    throw new ServiceMutationError("Automation action property was not found", 404);
  }

  const commit = await commitDataSourceMutation(
    {
      actorId: input.actorId,
      changed: propertyIds.length ? ["rows", "values"] : ["rows"],
      dataSourceId: source.id,
      env: input.env,
    },
    async (tx) => {
      await lockDatabaseAutomationFactRows(
        tx,
        input.rows.map((row) => ({ dataSourceId: source.id, rowId: row.rowId })),
      );
      const pageIds = input.rows.map((row) => row.pageId);
      const [activeRows, pages, currentValues] = await Promise.all([
        tx
          .select({ id: databaseRow.id, pageId: databaseRow.pageId })
          .from(databaseRow)
          .where(
            and(
              eq(databaseRow.dataSourceId, source.id),
              inArray(databaseRow.id, input.rows.map((row) => row.rowId)),
              isNull(databaseRow.deletedAt),
            ),
          ),
        tx
          .select({ id: page.id, name: page.name })
          .from(page)
          .where(and(inArray(page.id, pageIds), isNull(page.deletedAt))),
        propertyIds.length
          ? tx
              .select({ pageId: pagePropertyValue.pageId, propertyId: pagePropertyValue.propertyId, value: pagePropertyValue.value })
              .from(pagePropertyValue)
              .where(
                and(
                  inArray(pagePropertyValue.pageId, pageIds),
                  inArray(pagePropertyValue.propertyId, propertyIds),
                ),
              )
          : Promise.resolve([]),
      ]);
      if (activeRows.length !== input.rows.length || pages.length !== input.rows.length) {
        throw new ServiceMutationError("Automation target row was unavailable", 404);
      }
      const now = new Date();
      const current = new Map(
        currentValues.map((value) => [`${value.pageId}:${value.propertyId}`, value.value]),
      );
      const titles = new Map(pages.map((record) => [record.id, record.name]));
      const writtenValuesByKey = new Map<string, { pageId: string; propertyId: string; value: unknown }>();
      const titleValuesByPageId = new Map<string, { after: string; before: string; pageId: string }>();

      for (const row of input.rows) {
        for (const operation of input.operations) {
          if (operation.propertyId === "name") {
            const before = titles.get(row.pageId) ?? "";
            const after = operation.mode === "clear"
              ? "Untitled"
              : String(operation.value ?? "").trim() || "Untitled";
            titles.set(row.pageId, after);
            const first = titleValuesByPageId.get(row.pageId);
            titleValuesByPageId.set(row.pageId, {
              after,
              before: first?.before ?? before,
              pageId: row.pageId,
            });
            continue;
          }
          const property = propertiesById.get(operation.propertyId)!;
          const key = `${row.pageId}:${operation.propertyId}`;
          const normalizedOperation = {
            ...operation,
            value: normalizeEntityValue(property.config, operation.value),
          };
          const value = applyDatabaseAutomationPropertyOperation(
            current.get(key) ?? null,
            normalizedOperation,
            property.type,
          );
          validateCellValue(property.type, property.config, value);
          current.set(key, value);
          writtenValuesByKey.set(key, { pageId: row.pageId, propertyId: operation.propertyId, value });
        }
      }

      const titleValues = [...titleValuesByPageId.values()];
      const writtenValues = [...writtenValuesByKey.values()];

      for (const title of titleValues) {
        await tx.update(page).set({ name: title.after, updatedAt: now }).where(eq(page.id, title.pageId));
      }
      if (writtenValues.length) {
        await tx
          .insert(pagePropertyValue)
          .values(writtenValues.map((value) => ({ id: crypto.randomUUID(), ...value, updatedAt: now })))
          .onConflictDoUpdate({
            target: [pagePropertyValue.pageId, pagePropertyValue.propertyId],
            set: { updatedAt: now, value: sql`excluded.value` },
          });
      }
      await tx
        .update(databaseRow)
        .set({ lastEditedById: input.actorId, updatedAt: now })
        .where(inArray(databaseRow.id, input.rows.map((row) => row.rowId)));

      const facts = input.rows.map((row) => ({
        actorId: input.actorId,
        automationRunId: input.runId,
        changedValues: [
          ...titleValues
            .filter((value) => value.pageId === row.pageId)
            .map((value) => ({ after: value.after, before: value.before, propertyId: "name" })),
          ...writtenValues
            .filter((value) => value.pageId === row.pageId)
            .map((value) => ({
              after: value.value,
              before: currentValues.find(
                (currentValue) => currentValue.pageId === row.pageId && currentValue.propertyId === value.propertyId,
              )?.value ?? null,
              propertyId: value.propertyId,
            })),
        ],
        dataSourceId: source.id,
        origin: "automation" as const,
        pageId: row.pageId,
        rowId: row.rowId,
      }));
      return {
        automationFacts: facts,
        delta: {
          rows: input.rows.map((row) => ({
            id: row.rowId,
            lastEditedById: input.actorId,
            ...(titleValuesByPageId.has(row.pageId)
              ? { page: { id: row.pageId, name: titles.get(row.pageId), updatedAt: now.toISOString() } }
              : {}),
            updatedAt: now.toISOString(),
          })),
          ...(writtenValues.length
            ? { values: writtenValues.map((value) => ({ ...value, updatedAt: now.toISOString() })) }
            : {}),
        },
      };
    },
  );
  return { commit, editedRows: input.rows.length };
}

function normalizeEntityValue(config: unknown, value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => normalizeEntityValue(config, item));
  if (!value || typeof value !== "object" || (value as { type?: unknown }).type !== "entity") {
    return value;
  }
  const id = (value as { id?: unknown }).id;
  if (typeof id !== "string") return value;
  const options = config && typeof config === "object" && Array.isArray((config as { options?: unknown }).options)
    ? (config as { options: unknown[] }).options
    : [];
  const option = options.find(
    (candidate) => candidate && typeof candidate === "object" && (candidate as { id?: unknown }).id === id,
  ) as { name?: unknown } | undefined;
  return typeof option?.name === "string" ? option.name : id;
}

export function applyDatabaseAutomationPropertyOperation(
  current: unknown,
  operation: ResolvedAutomationPropertyOperation,
  propertyType: string,
) {
  if (operation.mode === "clear") {
    return ["multi_select", "person", "relation"].includes(propertyType) ? [] : null;
  }
  if (operation.mode === "set") return operation.value ?? null;
  const values = Array.isArray(current) ? [...current] : [];
  const additions = Array.isArray(operation.value) ? operation.value : [operation.value];
  if (operation.mode === "add") {
    for (const value of additions) {
      if (!values.some((candidate) => JSON.stringify(candidate) === JSON.stringify(value))) {
        values.push(value);
      }
    }
    return values;
  }
  return values.filter(
    (candidate) => !additions.some((value) => JSON.stringify(candidate) === JSON.stringify(value)),
  );
}
