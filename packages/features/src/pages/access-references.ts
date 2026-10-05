import { z } from "zod";
import type { QueryClient } from "@tanstack/react-query";
import type { DataSession } from "../data/session";
import { sharedClient, type SharedClient } from "../data/client";
import type { PageAccessRule, PageAccessPayload } from "./contracts";
import type {
  DatabaseAccessPayload,
  DatabaseAccessRule,
} from "../databases/access/access-contracts";

const ruleFields = {
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  targetId: z.string(),
  targetType: z.enum(["public", "user", "team", "agent"]),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
};
const pageRuleSchema = z
  .object({
    ...ruleFields,
    pageId: z.string().min(1),
    accessLevel: z.enum(["view", "comment", "edit", "full"]),
  })
  .strict();
const databaseRuleSchema = z
  .object({
    ...ruleFields,
    databaseId: z.string().min(1),
    accessLevel: z.enum(["view", "edit", "full"]),
  })
  .strict();
export class AccessCollections {
  readonly pages;
  readonly databases;
  constructor(session: DataSession) {
    const clock = (item: { id: string; readSequence?: number }) => ({
      scope: "actor" as const,
      id: `${session.id}:${item.id}`,
      revision: item.readSequence!,
    });
    this.pages = session.register({
      name: "page-access-facets",
      schema: pageRuleSchema.extend({ readSequence: z.number().int().nonnegative() }),
      clock,
    });
    this.databases = session.register({
      name: "database-access-facets",
      schema: databaseRuleSchema.extend({ readSequence: z.number().int().nonnegative() }),
      clock,
    });
  }
}
export type AccessReference = { cacheId: string; id: string };
export function normalizeAccessReferences(
  client: QueryClient,
  read: ReturnType<SharedClient["capture"]>,
  kind: "page" | "database",
  itemId: string,
  input: unknown,
): { access: AccessReference[] } {
  const rules =
    kind === "page"
      ? z.array(pageRuleSchema).parse(input)
      : z.array(databaseRuleSchema).parse(input);
  if (!rules.length) return { access: [] };
  const workspaceId = rules[0]!.workspaceId;
  if (
    rules.some(
      (rule) =>
        rule.workspaceId !== workspaceId ||
        ("pageId" in rule ? rule.pageId : rule.databaseId) !== itemId,
    )
  )
    throw new Error("Access facet scope mismatch");
  const owner = sharedClient(client).resolve(read, workspaceId);
  const entities = rules.map((rule) => ({ ...rule, readSequence: read.sequence }));
  owner.session.ingest([
    kind === "page"
      ? owner.access.pages.stage(entities as Array<PageAccessRule & { readSequence: number }>)
      : owner.access.databases.stage(
          entities as Array<DatabaseAccessRule & { readSequence: number }>,
        ),
  ]);
  return { access: rules.map(({ id }) => ({ id, cacheId: owner.session.id })) };
}
export function resolvePageAccessReferences(
  client: QueryClient,
  reference: { access: AccessReference[] },
): PageAccessPayload {
  return {
    access: reference.access.flatMap((ref) => {
      const rule = sharedClient(client).get(ref.cacheId)?.access.pages.get(ref.id);
      return rule ? [pageRuleSchema.strip().parse(rule)] : [];
    }),
  };
}
export function resolveDatabaseAccessReferences(
  client: QueryClient,
  reference: { access: AccessReference[] },
): DatabaseAccessPayload {
  return {
    access: reference.access.flatMap((ref) => {
      const rule = sharedClient(client).get(ref.cacheId)?.access.databases.get(ref.id);
      return rule ? [databaseRuleSchema.strip().parse(rule)] : [];
    }),
  };
}
