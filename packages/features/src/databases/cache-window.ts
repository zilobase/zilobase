import { z } from "zod";
import type { QueryClient } from "@tanstack/react-query";
import { sharedClient } from "../data/client";
import {
  databaseRecordWindowResponseSchema,
  type DatabaseRecordWindowResponse,
} from "./core/entities";

export const databaseWindowReferenceSchema = databaseRecordWindowResponseSchema
  .omit({ records: true })
  .extend({ cacheId: z.string(), recordIds: z.array(z.string()) });
export type DatabaseWindowReference = z.infer<typeof databaseWindowReferenceSchema>;
export function normalizeRecordWindow(
  client: QueryClient,
  databaseId: string,
  dataSourceId: string,
  queryHash: string,
  input: unknown,
): DatabaseWindowReference {
  const owner = sharedClient(client).database(databaseId);
  if (!owner) throw new Error("Record read requires an authorized bootstrap");
  const result = owner.databases.ingestWindow(databaseId, dataSourceId, queryHash, input);
  return { ...result, cacheId: owner.session.id };
}
export function resolveRecordWindow(
  client: QueryClient,
  input: unknown,
): DatabaseRecordWindowResponse | undefined {
  const parsed = databaseWindowReferenceSchema.safeParse(input);
  if (!parsed.success) return undefined;
  const { cacheId, recordIds, ...result } = parsed.data;
  const owner = sharedClient(client).get(cacheId);
  if (!owner) return undefined;
  return {
    ...result,
    records: recordIds.flatMap((id) => {
      const record = owner.databases.resolveRecord(id);
      return record ? [record] : [];
    }),
  };
}
