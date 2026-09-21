import { and, eq, isNull } from "drizzle-orm";
import type { AgentSettingsDefinition } from "@zilobase/features/ai-chat/settings-contract";
import { prosemirrorToMarkdown } from "@zilobase/page-context/prosemirror-to-markdown";
import { db } from "../../../infrastructure/database";
import {
  page,
} from "../../../infrastructure/database/schema";
import {
  canAccessPageInWorkspace,
  canAccessDatabaseInWorkspace,
} from "../../access";
import { AgentProfileError } from "../agents/agent-profile-service";

type Actor = { scope: string; workspaceId: string; userId: string };
type Resource = AgentSettingsDefinition["resources"][number];
export function instructionReferences(content: unknown): Resource[] {
  const found = new Map<string, Resource>();
  const add = (resourceType: "page" | "database", resourceId: unknown) => {
    if (typeof resourceId === "string" && /^[0-9a-f-]{36}$/i.test(resourceId))
      found.set(`${resourceType}:${resourceId}`, {
        resourceType,
        resourceId,
        accessLevel: "view",
      });
  };
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = value as Record<string, unknown>;
    const attrs = node.attrs as Record<string, unknown> | undefined;
    if (attrs) {
      add("page", attrs.pageId);
      add("database", attrs.databaseId);
      if (typeof attrs.href === "string") {
        const match = attrs.href.match(/^\/(p|d)\/([0-9a-f-]{36})(?:[?#/]|$)/i);
        if (match) add(match[1] === "p" ? "page" : "database", match[2]);
      }
    }
    visit(node.content);
    visit(node.marks);
  };
  visit(content);
  return [...found.values()];
}
export function allInstructionResources(
  d: AgentSettingsDefinition,
): Resource[] {
  const resources = new Map<string, Resource>(
    (d.instructionResources ?? []).map((r) => [
      `${r.resourceType}:${r.resourceId}`,
      r,
    ]),
  );
  for (const r of d.resources)
    resources.set(`${r.resourceType}:${r.resourceId}`, r);
  return [...resources.values()];
}
export async function hydrateInstructionPage(
  a: Actor,
  d: AgentSettingsDefinition,
): Promise<AgentSettingsDefinition> {
  if (!d.instructionPageId) return d;
  if (
    !(await canAccessPageInWorkspace(
      d.instructionPageId,
      a.workspaceId,
      a.userId,
      "view",
    ))
  )
    throw new AgentProfileError(
      "instruction_page_forbidden",
      "You cannot access the linked instruction page.",
      403,
    );
  const [source] = await db
    .select()
    .from(page)
    .where(
      and(
        eq(page.id, d.instructionPageId),
        eq(page.workspaceId, a.workspaceId),
        isNull(page.deletedAt),
      ),
    );
  if (!source)
    throw new AgentProfileError(
      "instruction_page_missing",
      "The linked instruction page is unavailable.",
      404,
    );
  const resources: Resource[] = [
    { resourceType: "page", resourceId: source.id, accessLevel: "view" },
  ];
  const seen = new Set([`page:${source.id}`]);
  const pending = instructionReferences(source.content);
  while (pending.length) {
    const r = pending.shift()!;
    const key = `${r.resourceType}:${r.resourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (seen.size > 200)
      throw new AgentProfileError(
        "instruction_links_limit",
        "Instructions can grant access to at most 200 linked resources.",
        400,
      );
    const allowed =
      r.resourceType === "page"
        ? await canAccessPageInWorkspace(
            r.resourceId,
            a.workspaceId,
            a.userId,
            "view",
          )
        : await canAccessDatabaseInWorkspace(
            r.resourceId,
            a.workspaceId,
            a.userId,
            "view",
          );
    if (!allowed) continue;
    resources.push(r);
    if (r.resourceType === "page") {
      const [linked] = await db
        .select()
        .from(page)
        .where(
          and(
            eq(page.id, r.resourceId),
            eq(page.workspaceId, a.workspaceId),
            isNull(page.deletedAt),
          ),
        );
      if (linked) pending.push(...instructionReferences(linked.content));
    }
  }
  const content = (source.content ?? { type: "doc", content: [] }) as Record<
    string,
    unknown
  >;
  return {
    ...d,
    instructionTitle: source.name,
    instructionDocument: content,
    instructions: prosemirrorToMarkdown(content),
    instructionResources:
      a.scope === "personal"
        ? []
        : resources.map((r) => ({ ...r, accessLevel: "view" as const })),
  };
}
