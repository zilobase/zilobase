import { and, eq } from "drizzle-orm";
import { aiSettings, aiSettingsDraft } from "../../../infrastructure/database/schema";

import type { db } from "../../../infrastructure/database";

import { AgentProfileError } from "../agents/agent-profile-service";

export type SettingsTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const settingsConflict = () =>
  new AgentProfileError(
    "settings_conflict",
    "Settings changed elsewhere. Reload the saved version before publishing your draft.",
    409,
  );

export async function loadLockedSettingsDraft(
  tx: SettingsTransaction,
  settingsId: string,
  userId: string,
) {
  const [saved] = await tx
    .select()
    .from(aiSettings)
    .where(eq(aiSettings.id, settingsId))
    .for("update");
  const [draft] = await tx
    .select()
    .from(aiSettingsDraft)
    .where(and(eq(aiSettingsDraft.settingsId, settingsId), eq(aiSettingsDraft.userId, userId)));
  return { saved, draft };
}
