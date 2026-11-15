import { normalizeSidebarConfig, type SidebarConfig } from "@zilobase/features/runtime";
import { eq } from "drizzle-orm";
import { db } from "../../../infrastructure/database/index";
import { pageSettings } from "../../../infrastructure/database/schema";
type EmbeddedItemsOpenAs = "dialog" | "sidepanel";

type UserSettingsPayload = {
  embeddedItemsOpenAs: EmbeddedItemsOpenAs;
  pageFullWidth: boolean;
  sidebarConfig: SidebarConfig;
};

export async function getOrCreateUserSettings(userId: string) {
  const [existing] = await db
    .select()
    .from(pageSettings)
    .where(eq(pageSettings.userId, userId))
    .limit(1);

  if (existing) {
    return toUserSettingsPayload(existing);
  }

  const [created] = await db
    .insert(pageSettings)
    .values({
      id: crypto.randomUUID(),
      userId,
    })
    .onConflictDoNothing({ target: pageSettings.userId })
    .returning();

  if (created) {
    return toUserSettingsPayload(created);
  }

  const [concurrent] = await db
    .select()
    .from(pageSettings)
    .where(eq(pageSettings.userId, userId))
    .limit(1);

  if (!concurrent) {
    throw new Error("Failed to load user settings");
  }

  return toUserSettingsPayload(concurrent);
}

function toUserSettingsPayload(settings: typeof pageSettings.$inferSelect): UserSettingsPayload {
  return {
    embeddedItemsOpenAs: settings.embeddedItemsOpenAs === "dialog" ? "dialog" : "sidepanel",
    pageFullWidth: settings.pageFullWidth,
    sidebarConfig: normalizeSidebarConfig(settings.sidebarConfig),
  };
}

export async function updateUserPreferences(
  userId: string,
  patch: {
    pageFullWidth?: boolean;
    embeddedItemsOpenAs?: EmbeddedItemsOpenAs;
    sidebarConfig?: unknown;
  },
) {
  const values: Partial<typeof pageSettings.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (patch.pageFullWidth !== undefined) {
    values.pageFullWidth = patch.pageFullWidth;
  }

  if (patch.embeddedItemsOpenAs !== undefined) {
    values.embeddedItemsOpenAs = patch.embeddedItemsOpenAs;
  }

  if (patch.sidebarConfig !== undefined) {
    values.sidebarConfig = normalizeSidebarConfig(patch.sidebarConfig);
  }

  const [settings] = await db
    .insert(pageSettings)
    .values({
      id: crypto.randomUUID(),
      userId,
      embeddedItemsOpenAs: values.embeddedItemsOpenAs ?? "sidepanel",
      pageFullWidth: values.pageFullWidth ?? false,
      sidebarConfig: values.sidebarConfig ?? {},
    })
    .onConflictDoUpdate({
      target: pageSettings.userId,
      set: values,
    })
    .returning();

  return toUserSettingsPayload(settings);
}
