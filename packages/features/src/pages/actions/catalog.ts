import {
  createDatabaseBlockNodes,
  markdownToPageDocument,
  type PageEdit,
} from "@zilobase/page-context";
import { z } from "zod";
import type { PlanOutcome, PlanResults, PlanStep } from "../../actions/plan";
import type { WriteAction } from "../../actions/types";
import {
  createDatabaseInput,
  planCreateDatabase,
  type DatabaseActionOps,
} from "../../databases/actions/catalog";
import type { Page } from "../contracts";

/** Page operations a page action may issue; clients and servers implement them. */
export type PageActionOps = {
  /** Stable IDs for pages and databases a plan creates, so blocks can reference them up front. */
  reserveIds: (input: { refs: string[] }) => Promise<Record<string, string>>;
  createPage: (input: {
    pageId: string;
    workspaceId: string;
    name: string;
    metadata?: { emoji?: string };
    parentPageId?: string;
    teamspaceId?: string;
    content: unknown;
  }) => Promise<Page>;
  updatePage: (input: {
    pageId: string;
    name?: string;
    metadata?: { emoji?: string };
  }) => Promise<Page>;
  setPageFavorite: (input: { pageId: string; favorite: boolean }) => Promise<unknown>;
  addPageComment: (input: {
    pageId: string;
    body: string;
  }) => Promise<{ threadId: string; messageId: string }>;
  restorePage: (input: { pageId: string }) => Promise<Page>;
  deletePage: (input: { pageId: string }) => Promise<unknown>;
  embedItem: (input: {
    hostPageId: string;
    itemId: string;
    kind: "page" | "database";
  }) => Promise<{ action: string; placementId: string | null }>;
  editPageContent: (input: {
    pageId: string;
    edits: PageEdit[];
  }) => Promise<{ status: "applied" | "replayed"; blocks: number }>;
};

type Ops = PageActionOps & DatabaseActionOps;
type Step = PlanStep<Ops>;
type PageState = { workspaceId: string; createSampleRowContent?: (markdown: string) => unknown };

const id = z.string().trim().min(1).max(128);
const icon = z.string().max(16).optional().describe("A single emoji.");
const content = z
  .string()
  .max(100_000)
  .optional()
  .describe(
    "Page body in Markdown: headings, lists, task lists (- [ ]), tables, quotes, code, $$ math, links. Containers use directives closed by ':::' — ':::callout 💡' for callouts or highlighted notes ('>' is only a plain quote), ':::toggle Summary', ':::tabs' with ':::tab Title' inside, ':::columns' with ':::column' inside. Standalone lines: '[Table of contents]', '![alt](url)', '[Embed: title](url)', '[Bookmark: title](url)', '[Page: Title]' and '[Database: Name]' to place a subpage or inline database of this call.",
  );
const pageFields = {
  title: z.string().trim().max(200),
  icon,
  content,
};

const createPageInput = z
  .object({
    ...pageFields,
    parentPageId: id
      .optional()
      .describe("Page to nest the new page in; omit for a top-level page."),
    teamspaceId: id
      .optional()
      .describe("Teamspace for a top-level page; nested pages use their parent's teamspace."),
    subpages: z
      .array(z.object(pageFields).strict())
      .max(20)
      .optional()
      .describe("Child pages created inside the new page. Unplaced ones are added at the end."),
    databases: z
      .array(createDatabaseInput.omit({ parentPageId: true, teamspaceId: true }))
      .max(10)
      .optional()
      .describe(
        "Inline databases created inside the new page. Unplaced ones are added at the end.",
      ),
  })
  .strict();
export type CreatePageActionInput = z.infer<typeof createPageInput>;

const updatePageInput = z
  .object({
    pageId: id,
    title: z.string().trim().max(200).optional(),
    icon,
  })
  .strict();

const favoritePageInput = z.object({ pageId: id, favorite: z.boolean() }).strict();
const commentInput = z
  .object({
    pageId: id,
    body: z.string().trim().min(1).max(10_000).describe("Plain-text comment."),
  })
  .strict();
const restoreInput = z.object({ pageId: id.describe("A page in the trash.") }).strict();
const anchor = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .describe(
    'A blockId from read_page (preferred; exact even if the page changed), or the text of an existing top-level block such as a heading\'s text or the start of a paragraph — e.g. "Links" for a "## Links" heading. Inserts also accept a block number from read_page.',
  );
const markdown = z
  .string()
  .max(100_000)
  .describe("New blocks in the same Markdown as pages.create.");
const pageEditSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("append"), markdown }).strict(),
  z.object({ type: z.literal("prepend"), markdown }).strict(),
  z.object({ type: z.literal("insert_after"), anchor, markdown }).strict(),
  z.object({ type: z.literal("insert_before"), anchor, markdown }).strict(),
  z.object({ type: z.literal("replace_block"), anchor, markdown }).strict(),
  z
    .object({ type: z.literal("replace_section"), heading: anchor, markdown })
    .strict()
    .describe("Replace everything under a heading, keeping the heading."),
  z
    .object({
      type: z.literal("replace_text"),
      find: z.string().min(1).max(2_000),
      replace: z.string().max(10_000),
      all: z.boolean().optional(),
    })
    .strict()
    .describe("Fix wording inside blocks while keeping their formatting."),
]);
const embedInput = z
  .object({
    pageId: id.describe("The page to embed into."),
    itemId: id.describe("The page or database to embed."),
    kind: z.enum(["page", "database"]),
    after: anchor
      .optional()
      .describe(
        'The blockId from read_page of the block to place it after, or its text, e.g. "Links" to place it under a "## Links" heading; omit to add it at the end.',
      ),
  })
  .strict();
const editInput = z.object({ pageId: id, edits: z.array(pageEditSchema).min(1).max(50) }).strict();

const same = (left: string, right: string) =>
  left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();

const metadata = (emoji: string | undefined) => (emoji ? { metadata: { emoji } } : {});

/** Builds a page body, placing this call's subpages and databases where the Markdown references them. */
function pageBody(
  markdown: string | undefined,
  references: {
    subpages: Array<{ title: string; id: string }>;
    databases: Array<{ name: string; id: string }>;
  },
) {
  const placed = new Set<string>();
  const resolve =
    <T extends { id: string }>(items: T[], name: (item: T) => string) =>
    (title: string) => {
      const item = items.find(
        (candidate) => !placed.has(candidate.id) && same(name(candidate), title),
      );
      if (item) placed.add(item.id);
      return item?.id;
    };
  const parsed = markdownToPageDocument(markdown ?? "", {
    page: resolve(references.subpages, (page) => page.title),
    database: resolve(references.databases, (database) => database.name),
  });
  const blocks = markdown?.trim() ? [...(parsed.content ?? [])] : [];
  for (const page of references.subpages)
    if (!placed.has(page.id)) blocks.push({ type: "pageBlock", attrs: { pageId: page.id } });
  for (const database of references.databases)
    if (!placed.has(database.id)) blocks.push(...createDatabaseBlockNodes(database.id));
  return { type: "doc", content: blocks.length ? blocks : [{ type: "paragraph" }] };
}

/** Plans a page with its subpages and inline databases, each with a reserved ID. */
export function planCreatePageTree(
  state: PageState,
  input: CreatePageActionInput,
): PlanOutcome<Ops> {
  const subpages = input.subpages ?? [];
  const databases = input.databases ?? [];
  const ids = (done: PlanResults) => done.get<Record<string, string>>("ids");
  const steps: Step[] = [
    {
      id: "ids",
      op: "reserveIds",
      input: () => ({
        refs: [
          "page",
          ...subpages.map((_, index) => `subpage:${index}`),
          ...databases.map((_, index) => `database:${index}`),
        ],
      }),
    },
    {
      id: "page",
      op: "createPage",
      input: (done) => ({
        pageId: ids(done).page!,
        workspaceId: state.workspaceId,
        name: input.title,
        ...metadata(input.icon),
        ...(input.parentPageId ? { parentPageId: input.parentPageId } : {}),
        ...(input.teamspaceId && !input.parentPageId ? { teamspaceId: input.teamspaceId } : {}),
        content: pageBody(input.content, {
          subpages: subpages.map((page, index) => ({
            title: page.title,
            id: ids(done)[`subpage:${index}`]!,
          })),
          databases: databases.map((database, index) => ({
            name: database.name,
            id: ids(done)[`database:${index}`]!,
          })),
        }),
      }),
      failure: "The page couldn't be created.",
    },
    ...subpages.map((page, index): Step => ({
      op: "createPage",
      input: (done) => ({
        pageId: ids(done)[`subpage:${index}`]!,
        workspaceId: state.workspaceId,
        name: page.title,
        ...metadata(page.icon),
        parentPageId: ids(done).page!,
        content: pageBody(page.content, { subpages: [], databases: [] }),
      }),
    })),
  ];
  for (const [index, database] of databases.entries()) {
    const plan = planCreateDatabase(state, database, {
      stepId: `database:${index}`,
      databaseId: (done) => ids(done)[`database:${index}`]!,
      pageId: (done) => ids(done).page!,
    });
    if ("rejected" in plan) return plan;
    steps.push(...(plan.steps as Step[]));
  }
  return { steps, select: "page" };
}

const pageAction = <I>(
  action: Omit<
    WriteAction<I, PageState, Ops>,
    "kind" | "scopes" | "needs" | "group" | "effect" | "milestone"
  > &
    Partial<Pick<WriteAction<I, PageState, Ops>, "effect">>,
) =>
  ({
    kind: "write",
    group: "pages.write",
    effect: "write",
    scopes: ["pages.write"],
    milestone: "B",
    needs: () => ({}),
    ...action,
  }) satisfies WriteAction<I, PageState, Ops>;

export const pageActions = [
  pageAction({
    name: "pages.create",
    title: "Create page",
    description:
      "Create a page with rich content, optionally with subpages and inline databases (properties, rows). Add database views afterwards with databases.add_view. Write real blocks, not imitations: '[Table of contents]' for a table of contents, ':::toggle Title' … ':::' for toggles, ':::columns' with ':::column' … ':::' sections for side-by-side columns, ':::callout 💡' … ':::' for callouts.",
    input: createPageInput,
    covers: ["page.create", "database.create", "template.apply"],
    plan: planCreatePageTree,
  }),
  pageAction({
    name: "pages.update",
    title: "Rename page",
    description:
      "Change a page's title or emoji icon. Editing an existing page's content is not available yet.",
    input: updatePageInput,
    covers: ["page.update"],
    plan: (_, input) =>
      input.title === undefined && !input.icon
        ? { rejected: "unchanged", message: "Nothing to change." }
        : {
            steps: [
              {
                op: "updatePage",
                input: () => ({
                  pageId: input.pageId,
                  ...(input.title !== undefined ? { name: input.title } : {}),
                  ...metadata(input.icon),
                }),
              },
            ],
          },
  }),
  pageAction({
    name: "pages.favorite",
    title: "Favorite page",
    description: "Add a page to or remove it from the user's favorites.",
    input: favoritePageInput,
    covers: ["page.favorite"],
    plan: (_, input) => ({ steps: [{ op: "setPageFavorite", input: () => input }] }),
  }),
  pageAction({
    name: "pages.comment",
    title: "Comment on page",
    description: "Add a page-level comment as the user, for example a review note or summary.",
    input: commentInput,
    covers: ["page.comment"],
    plan: (_, input) => ({ steps: [{ op: "addPageComment", input: () => input }] }),
  }),
  {
    ...pageAction({
      name: "pages.edit",
      title: "Edit page",
      description:
        "Change an existing page's content: append, prepend, insert or replace blocks, rewrite a section under a heading, or fix wording. Read the page with read_page first and anchor edits to its text. Edits apply to the live page; other blocks and comments are kept.",
      input: editInput,
      covers: ["page.edit"],
      plan: (_, input) => ({ steps: [{ op: "editPageContent", input: () => input }] }),
    }),
    milestone: "C" as const,
  },
  {
    ...pageAction({
      name: "pages.embed",
      title: "Embed in page",
      description:
        "Show an existing page or database inside another page as a block, like dragging it in. A top-level page becomes a subpage; others are linked.",
      input: embedInput,
      covers: ["page.edit", "page.embed"],
      plan: (_, input) => {
        const markdown =
          input.kind === "page" ? `[Page: Page (${input.itemId})]` : `[Database (${input.itemId})]`;
        return {
          // The embed service checks the item first, so a refused embed leaves no block behind.
          steps: [
            {
              op: "embedItem",
              input: () => ({ hostPageId: input.pageId, itemId: input.itemId, kind: input.kind }),
            },
            {
              op: "editPageContent",
              input: () => ({
                pageId: input.pageId,
                edits: [
                  input.after
                    ? { type: "insert_after" as const, anchor: input.after, markdown }
                    : { type: "append" as const, markdown },
                ],
              }),
            },
          ],
        };
      },
    }),
    milestone: "C" as const,
  },
  {
    ...pageAction({
      name: "pages.delete",
      title: "Move page to trash",
      description:
        "Move a page (and its subpages) to the trash. The user must confirm it in the chat before it happens.",
      input: z.object({ pageId: id }).strict(),
      covers: ["page.delete"],
      plan: (_, input) => ({ steps: [{ op: "deletePage", input: () => input }] }),
    }),
    effect: "destructive" as const,
    milestone: "D" as const,
  },
  pageAction({
    name: "pages.restore",
    title: "Restore page",
    description: "Restore a page from the trash.",
    input: restoreInput,
    covers: ["page.restore"],
    plan: (_, input) => ({ steps: [{ op: "restorePage", input: () => input }] }),
  }),
];
