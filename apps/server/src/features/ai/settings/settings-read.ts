import { hydrateInstructionPage } from "./instruction-pages";
import { and, desc, eq } from "drizzle-orm";
import { settingsReviewSchema, settingsDefinitionSchema, type AgentSettingsState } from "@zilobase/features/ai-chat/settings-contract";

import { db } from "../../../infrastructure/database";
import { aiSettingsDraft, aiSettingsVersion } from "../../../infrastructure/database/schema";
import { type SettingsActor, authorizeSettings } from "./settings-access";
import { getSettingsRecord } from "./settings-record";
import { sameSettings } from "./settings-definition";

export async function readSettings(
  a: SettingsActor,
): Promise<AgentSettingsState> {
  const role = await authorizeSettings(a);
  const saved = await getSettingsRecord(a);
  const [draft] = await db
    .select()
    .from(aiSettingsDraft)
    .where(
      and(
        eq(aiSettingsDraft.settingsId, saved.id),
        eq(aiSettingsDraft.userId, a.userId),
      ),
    );
  const savedDefinition = settingsDefinitionSchema.parse(saved.definition);
  let definition = settingsDefinitionSchema.parse(draft?.definition ?? savedDefinition);
  if (role !== "user") {
    definition = await hydrateInstructionPage(a, definition);
  }
  let review = draft?.review ? settingsReviewSchema.parse(draft.review) : null;
  if (review && (review.fields.includes("instructions") || review.fields.includes("instructionDocument")) &&
      !sameSettings(review.before.instructionResources ?? [], definition.instructionResources ?? [])) {
    review = { ...review, after: { ...review.after, instructionResources: definition.instructionResources },
      fields: [...new Set([...review.fields, "instructionResources" as const])] };
  }
  return {
    definition,
    saved: savedDefinition,
    baseVersion: draft?.baseVersion ?? saved.version,
    version: saved.version,
    draftVersion: draft?.draftVersion ?? 0,
    pendingRun: draft?.pendingRun ?? null,
    canEdit: role !== "user",
    review,
  };
}

export async function settingsVersions(a: SettingsActor) {
  await authorizeSettings(a);
  const settings = await getSettingsRecord(a);
  const versions = await db
    .select({
      id: aiSettingsVersion.id,
      version: aiSettingsVersion.version,
      definition: aiSettingsVersion.definition,
      createdAt: aiSettingsVersion.createdAt,
    })
    .from(aiSettingsVersion)
    .where(eq(aiSettingsVersion.settingsId, settings.id))
    .orderBy(desc(aiSettingsVersion.version));
  return versions.map((version) => ({
    ...version,
    definition: settingsDefinitionSchema.parse(version.definition),
  }));
}
