import { eq } from "drizzle-orm";
import { getStringEnv, type RuntimeEnv } from "../../shared/config/config";
import { db, runWithDbEnv } from "../../infrastructure/database";
import { instanceSettings as instanceSettingsTable } from "../../infrastructure/database/schema";
import { INSTANCE_SETTINGS_ROW_ID, type InstanceSettingsRecord } from "./contracts";
type InstanceSettingsRepository = {
  create(record: InstanceSettingsRecord): Promise<void>;
  find(): Promise<InstanceSettingsRecord | null>;
};

const databaseInstanceSettingsRepository: InstanceSettingsRepository = {
  async create(record) {
    await db
      .insert(instanceSettingsTable)
      .values({
        id: INSTANCE_SETTINGS_ROW_ID,
        ...record,
      })
      .onConflictDoNothing({ target: instanceSettingsTable.id });
  },
  async find() {
    const [settings] = await db
      .select({
        displayName: instanceSettingsTable.displayName,
        instanceId: instanceSettingsTable.instanceId,
      })
      .from(instanceSettingsTable)
      .where(eq(instanceSettingsTable.id, INSTANCE_SETTINGS_ROW_ID))
      .limit(1);

    return settings ?? null;
  },
};

export function ensureInstanceSettings(env: RuntimeEnv) {
  return runWithDbEnv(env, () =>
    getOrCreateInstanceSettings(resolveInitialDisplayName(env), databaseInstanceSettingsRepository),
  );
}

export async function getOrCreateInstanceSettings(
  initialDisplayName: string,
  repository: InstanceSettingsRepository = databaseInstanceSettingsRepository,
) {
  const existing = await repository.find();

  if (existing) {
    return existing;
  }

  await repository.create({
    displayName: initialDisplayName,
    instanceId: crypto.randomUUID(),
  });

  const persisted = await repository.find();

  if (!persisted) {
    throw new Error("Unable to initialize instance settings");
  }

  return persisted;
}

function resolveInitialDisplayName(env: RuntimeEnv) {
  const displayName = getStringEnv(env, "ZILOBASE_INSTANCE_NAME")?.trim() ?? "Zilobase";

  if (!displayName || displayName.length > 100) {
    throw new Error("ZILOBASE_INSTANCE_NAME must contain between 1 and 100 characters");
  }

  return displayName;
}
