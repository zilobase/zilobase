import { Hono } from "hono";
import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import {
  normalizeSidebarConfig,
  type SidebarConfig,
} from "@zilobase/features/user-settings/sidebar-config";
import { db } from "../../infrastructure/database";
import { account, user, pageSettings } from "../../infrastructure/database/schema";
import type { AppBindings } from "../../shared/types";
import { readJsonBody } from "../../shared/http/request";

export const pageSettingsRoutes = new Hono<AppBindings>();

type EmbeddedItemsOpenAs = "dialog" | "sidepanel";

type UserSettingsPayload = {
  embeddedItemsOpenAs: EmbeddedItemsOpenAs;
  pageFullWidth: boolean;
  sidebarConfig: SidebarConfig;
};

const updateProfileSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().optional(),
    name: z.string().trim().min(1, "Name is required.").max(120).optional(),
  })
  .refine(
    (value) => value.name !== undefined || value.email !== undefined,
    "Provide at least one field to update.",
  );

pageSettingsRoutes.get("/", async (c) => {
  const user = c.get("user");

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return c.json({ settings: await getOrCreateUserSettings(user.id) });
});

pageSettingsRoutes.patch("/", async (c) => {
  const user = c.get("user");

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await readJsonBody(c.req);

  if (!body || typeof body !== "object") {
    return c.json({ error: "A JSON body is required" }, 400);
  }

  const patch = body as {
    embeddedItemsOpenAs?: unknown;
    pageFullWidth?: unknown;
    sidebarConfig?: unknown;
  };
  const values: Partial<typeof pageSettings.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (patch.pageFullWidth !== undefined) {
    if (typeof patch.pageFullWidth !== "boolean") {
      return c.json({ error: "pageFullWidth must be a boolean" }, 400);
    }

    values.pageFullWidth = patch.pageFullWidth;
  }

  if (patch.embeddedItemsOpenAs !== undefined) {
    if (
      patch.embeddedItemsOpenAs !== "dialog" &&
      patch.embeddedItemsOpenAs !== "sidepanel"
    ) {
      return c.json(
        { error: "embeddedItemsOpenAs must be 'dialog' or 'sidepanel'" },
        400,
      );
    }

    values.embeddedItemsOpenAs = patch.embeddedItemsOpenAs;
  }

  if (patch.sidebarConfig !== undefined) {
    if (
      typeof patch.sidebarConfig !== "object" ||
      patch.sidebarConfig === null ||
      Array.isArray(patch.sidebarConfig)
    ) {
      return c.json({ error: "sidebarConfig must be an object" }, 400);
    }

    values.sidebarConfig = normalizeSidebarConfig(patch.sidebarConfig);
  }

  const [settings] = await db
    .insert(pageSettings)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      embeddedItemsOpenAs: values.embeddedItemsOpenAs ?? "sidepanel",
      pageFullWidth: values.pageFullWidth ?? false,
      sidebarConfig: values.sidebarConfig ?? {},
    })
    .onConflictDoUpdate({
      target: pageSettings.userId,
      set: values,
    })
    .returning();

  return c.json({ settings: toUserSettingsPayload(settings) });
});

pageSettingsRoutes.patch("/profile", async (c) => {
  const currentUser = c.get("user");

  if (!currentUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await readJsonBody(c.req);
  const parsed = updateProfileSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, 400);
  }

  const nextName = parsed.data.name?.trim();
  const nextEmail = parsed.data.email?.trim().toLowerCase();

  if (nextEmail && nextEmail !== currentUser.email) {
    const [existingUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, nextEmail))
      .limit(1);

    if (existingUser && existingUser.id !== currentUser.id) {
      return c.json({ error: "That email address is already in use." }, 409);
    }
  }

  const [updatedUser] = await db
    .update(user)
    .set({
      email: nextEmail ?? currentUser.email,
      name: nextName ?? currentUser.name,
      updatedAt: new Date(),
    })
    .where(eq(user.id, currentUser.id))
    .returning({
      email: user.email,
      emailVerified: user.emailVerified,
      id: user.id,
      image: user.image,
      name: user.name,
    });

  return c.json({
    user: {
      ...updatedUser,
      hasPassword: await getUserHasPassword(currentUser.id),
    },
  });
});

async function getOrCreateUserSettings(userId: string) {
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

function toUserSettingsPayload(
  settings: typeof pageSettings.$inferSelect,
): UserSettingsPayload {
  return {
    embeddedItemsOpenAs:
      settings.embeddedItemsOpenAs === "dialog" ? "dialog" : "sidepanel",
    pageFullWidth: settings.pageFullWidth,
    sidebarConfig: normalizeSidebarConfig(settings.sidebarConfig),
  };
}

async function getUserHasPassword(userId: string) {
  const [credentialAccount] = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        eq(account.providerId, "credential"),
        isNotNull(account.password),
      ),
    )
    .limit(1);

  return Boolean(credentialAccount);
}
