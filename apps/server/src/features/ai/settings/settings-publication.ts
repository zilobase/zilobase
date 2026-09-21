import { loadLockedSettingsDraft } from "./settings-versioning";

import { hydrateInstructionPage } from "./instruction-pages";
import { eq } from "drizzle-orm";
import { settingsDefinitionSchema } from "@zilobase/features/ai-chat/settings-contract";

import { db } from "../../../infrastructure/database";
import { aiSettings, aiSettingsDraft, aiSettingsVersion } from "../../../infrastructure/database/schema";

import { type SettingsActor, authorizeSettings } from "./settings-access";
import { getSettingsRecord } from "./settings-record";
import { settingsConflict } from "./settings-versioning";
import { validateSettingsDefinition } from "./settings-validation";
import { sameSettings } from "./settings-definition";
import { materializeSettings } from "./settings-materialization";
import { readSettings } from "./settings-read";

export async function publishSettings(
  a: SettingsActor,
  input: { baseVersion: number; draftVersion: number },
) {
  await authorizeSettings(a, true);
  const settings = await getSettingsRecord(a);
  let pendingRun: string | null = null;
  await db.transaction(async (tx) => {
    const { saved, draft } = await loadLockedSettingsDraft(tx, settings.id, a.userId);
    if (!draft && input.baseVersion !== saved!.version) return;
    if (
      (draft?.baseVersion ?? saved!.version) !== saved!.version ||
      input.baseVersion !== saved!.version ||
      (draft?.draftVersion ?? 0) !== input.draftVersion
    )
      throw settingsConflict();
    let d = settingsDefinitionSchema.parse(
      draft?.definition ?? saved!.definition,
    );
    d = await hydrateInstructionPage(a, d);
    await validateSettingsDefinition(a, d);
    const changed = !sameSettings(
      settingsDefinitionSchema.parse(saved!.definition),
      d,
    );
    pendingRun = draft?.pendingRun ?? null;
    if (changed) {
      const version = saved!.version + 1;
      await materializeSettings(tx, a, d, saved!.version, version);
      await tx
        .update(aiSettings)
        .set({ definition: d, version, updatedAt: new Date() })
        .where(eq(aiSettings.id, settings.id));
      await tx.insert(aiSettingsVersion).values({
        id: crypto.randomUUID(),
        settingsId: settings.id,
        version,
        definition: d,
        createdByUserId: a.userId,
      });
    }
    if (draft)
      await tx.delete(aiSettingsDraft).where(eq(aiSettingsDraft.id, draft.id));
  });
  return { ...(await readSettings(a)), pendingRun };
}
