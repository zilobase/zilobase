import type { SettingsTransaction } from "./settings-versioning";
import { loadLockedSettingsDraft } from "./settings-versioning";
import {
  encodePageContentAsYjs,
  replacePageContent,
} from "../../collaboration/service";
import type { RuntimeEnv } from "../../../shared/config/config";

import { and, eq } from "drizzle-orm";
import {
  settingsReviewSchema,
  mergeSettingsReview,
  type AgentSettingsDefinition,
} from "@zilobase/features/ai-chat/settings-contract";
import { prosemirrorToMarkdown } from "@zilobase/page-context/prosemirror-to-markdown";
import { db } from "../../../infrastructure/database";
import {
  aiSettingsDraft,
  page,
  pageCollaborationDocument,
} from "../../../infrastructure/database/schema";
import { canAccessPageInWorkspace } from "../../access";
import { AgentProfileError } from "../agents/agent-profile-service";

import { markdownToPageContent } from "../conversion/markdown-to-page-content";
import { type SettingsActor, authorizeSettings } from "./settings-access";
import { getSettingsRecord } from "./settings-record";
import { readSettings } from "./settings-read";
import { settingsConflict } from "./settings-versioning";
import { mergeSettingsPatch } from "./settings-definition";

export function createSettingsInstruction(
  a: SettingsActor,
  input: { baseVersion: number; draftVersion: number },
) {
  return updateSettingsDraft(a, { ...input, patch: {} }, undefined, true);
}

export async function updateSettingsDraft(
  a: SettingsActor,
  input: {
    patch: Partial<AgentSettingsDefinition>;
    baseVersion: number;
    draftVersion: number;
    pendingRun?: string | null;
    origin?: "ai";
  },
  env?: RuntimeEnv,
  createInstruction = false,
) {
  await authorizeSettings(a, true);
  const settings = await getSettingsRecord(a);
  const proposalBase = input.origin === "ai" ? await readSettings(a) : null;
  await db.transaction(async (tx) => {
    const { saved, draft } = await loadLockedSettingsDraft(
      tx,
      settings.id,
      a.userId,
    );
    if (
      input.draftVersion !== (draft?.draftVersion ?? 0) ||
      input.baseVersion !== (draft?.baseVersion ?? saved!.version)
    )
      throw settingsConflict();
    if (createInstruction) {
      if (input.baseVersion !== saved!.version) throw settingsConflict();

      const content = markdownToPageContent("");
      const pageId = await createDraftInstructionPage(tx, a, content, "");

      input = {
        ...input,
        patch: {
          instructionPageId: pageId,
          instructionTitle: "",
          instructionDocument: content,
          instructions: "",
          instructionResources: [],
        },
      };
    }
    let definition = mergeSettingsPatch(
      (proposalBase?.definition ??
        draft?.definition ??
        saved!.definition) as AgentSettingsDefinition,
      input.patch,
    );
    validateDraftScope(a.scope, definition);
    if (
      proposalBase &&
      !definition.instructionPageId &&
      (input.patch.instructions !== undefined ||
        input.patch.instructionDocument ||
        input.patch.instructionTitle !== undefined)
    ) {
      const pageId = await createDraftInstructionPage(
        tx,
        a,
        definition.instructionDocument,
        definition.instructionTitle === "Instructions"
          ? ""
          : (definition.instructionTitle ?? ""),
      );

      definition = { ...definition, instructionPageId: pageId };
    }
    const review = reviewSettingsPatch(
      draft?.review,
      proposalBase?.definition,
      definition,
      input.patch,
    );
    const values = {
      definition,
      review,
      baseVersion: input.baseVersion,
      draftVersion: input.draftVersion + 1,
      pendingRun:
        input.pendingRun === undefined
          ? (draft?.pendingRun ?? null)
          : input.pendingRun,
      updatedAt: new Date(),
    };
    await tx
      .insert(aiSettingsDraft)
      .values({
        id: crypto.randomUUID(),
        settingsId: settings.id,
        userId: a.userId,
        ...values,
      })
      .onConflictDoUpdate({
        target: [aiSettingsDraft.settingsId, aiSettingsDraft.userId],
        set: values,
      });
  });
  if (
    !createInstruction &&
    (input.patch.instructionDocument ||
      input.patch.instructions !== undefined ||
      input.patch.instructionTitle !== undefined)
  ) {
    const snapshot = await readSettings(a);
    const pageId = snapshot.definition.instructionPageId;
    if (pageId) {
      if (
        !(await canAccessPageInWorkspace(
          pageId,
          a.workspaceId,
          a.userId,
          "edit",
        ))
      )
        throw new AgentProfileError(
          "instruction_page_forbidden",
          "You cannot edit this instruction page.",
          403,
        );
      if (
        input.patch.instructionDocument ||
        input.patch.instructions !== undefined
      )
        await replacePageContent({
          pageId,
          userId: a.userId,
          env: env ?? {},
          content:
            input.patch.instructionDocument ??
            markdownToPageContent(input.patch.instructions!),
        });
      if (input.patch.instructionTitle !== undefined)
        await db
          .update(page)
          .set({ name: input.patch.instructionTitle, updatedAt: new Date() })
          .where(eq(page.id, pageId));
    }
  }
  return readSettings(a);
}

export async function discardSettingsDraft(
  a: SettingsActor,
  draftVersion: number,
  env?: RuntimeEnv,
) {
  await authorizeSettings(a, true);
  const settings = await getSettingsRecord(a);
  const current = await readSettings(a);
  await db.transaction(async (tx) => {
    const { draft } = await loadLockedSettingsDraft(tx, settings.id, a.userId);
    if ((draft?.draftVersion ?? 0) !== draftVersion) throw settingsConflict();
    const review = draft?.review
      ? settingsReviewSchema.parse(draft.review)
      : null;
    const pageId = current.definition.instructionPageId;
    if (review && pageId && review.before.instructionPageId === pageId) {
      const contentChanged =
        review.fields.includes("instructions") ||
        review.fields.includes("instructionDocument");
      const titleChanged = review.fields.includes("instructionTitle");
      if (
        (contentChanged &&
          current.definition.instructions !==
            prosemirrorToMarkdown(review.after.instructionDocument)) ||
        (titleChanged &&
          current.definition.instructionTitle !== review.after.instructionTitle)
      ) {
        throw new AgentProfileError(
          "instruction_review_conflict",
          "The instruction page has newer edits. Review them before discarding the AI changes.",
          409,
        );
      }
      if (
        (contentChanged || titleChanged) &&
        !(await canAccessPageInWorkspace(
          pageId,
          a.workspaceId,
          a.userId,
          "edit",
        ))
      )
        throw new AgentProfileError(
          "instruction_page_forbidden",
          "You cannot edit this instruction page.",
          403,
        );
      if (contentChanged)
        await replacePageContent({
          pageId,
          userId: a.userId,
          env: env ?? {},
          content: review.before.instructionDocument,
        });
      if (titleChanged)
        await tx
          .update(page)
          .set({
            name: review.before.instructionTitle ?? "",
            updatedAt: new Date(),
          })
          .where(eq(page.id, pageId));
    }

    await tx
      .delete(aiSettingsDraft)
      .where(
        and(
          eq(aiSettingsDraft.settingsId, settings.id),
          eq(aiSettingsDraft.userId, a.userId),
        ),
      );
  });
  return readSettings(a);
}

async function createDraftInstructionPage(
  tx: SettingsTransaction,
  actor: SettingsActor,
  content: AgentSettingsDefinition["instructionDocument"],
  name: string,
) {
  const pageId = crypto.randomUUID();
  await tx
    .insert(page)
    .values({
      id: pageId,
      workspaceId: actor.workspaceId,
      createdById: actor.userId,
      type: "pageblock",
      name,
      content,
      metadata: { zilobaseai: "instruction" },
    });
  await tx
    .insert(pageCollaborationDocument)
    .values({
      pageId,
      state: Buffer.from(encodePageContentAsYjs(content)),
      updatedAt: new Date(),
    });
  return pageId;
}

function reviewSettingsPatch(
  previous: unknown,
  before: AgentSettingsDefinition | undefined,
  definition: AgentSettingsDefinition,
  patch: Partial<AgentSettingsDefinition>,
) {
  const previousReview = previous ? settingsReviewSchema.parse(previous) : null;
  if (!before) return previousReview;
  const fields = Object.keys(patch) as (keyof AgentSettingsDefinition)[];
  if (fields.includes("instructions")) fields.push("instructionDocument");
  if (definition.instructionPageId !== before.instructionPageId)
    fields.push("instructionPageId");
  return mergeSettingsReview(previousReview, before, definition, fields);
}

function validateDraftScope(
  scope: string,
  definition: AgentSettingsDefinition,
) {
  if (
    scope === "personal" &&
    (definition.triggers.length ||
      definition.resources.length ||
      definition.grants.length)
  )
    throw new AgentProfileError(
      "invalid_personal_settings",
      "Triggers and access are custom-agent settings.",
    );
}
