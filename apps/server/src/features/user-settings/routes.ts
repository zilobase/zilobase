import { Hono } from "hono";
import { and, eq, isNotNull } from "drizzle-orm";
import { Schema, SchemaTransformation } from "effect";
import {
  normalizeSidebarConfig,
  type SidebarConfig,
} from "@zilobase/features/user-settings/sidebar-config";
import { db } from "../../infrastructure/database";
import { account, user, pageSettings } from "../../infrastructure/database/schema";
import type { AppBindings } from "../../shared/types";
import { readJsonBody } from "../../shared/http/request";
import { parseJsonBody, parseUnknown } from "../../shared/http/schema-json";

export const pageSettingsRoutes = new Hono<AppBindings>();

type EmbeddedItemsOpenAs = "dialog" | "sidepanel";

type UserSettingsPayload = {
  embeddedItemsOpenAs: EmbeddedItemsOpenAs;
  pageFullWidth: boolean;
  sidebarConfig: SidebarConfig;
};

const UpdateProfile = Schema.Struct({
  email: Schema.optionalKey(
    Schema.String.pipe(
      Schema.decode(SchemaTransformation.trim()),
      Schema.decode(SchemaTransformation.toLowerCase()),
      Schema.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
    ),
  ),
  name: Schema.optionalKey(
    Schema.String.pipe(
      Schema.decode(SchemaTransformation.trim()),
      Schema.check(
        Schema.isMinLength(1, { message: "Name is required." }),
        Schema.isMaxLength(120),
      ),
    ),
  ),
}).check(
  Schema.makeFilter((value) =>
    value.name !== undefined || value.email !== undefined
      ? undefined
      : "Provide at least one field to update.",
  ),
);

const UpdateUserSettings = Schema.Struct({
  embeddedItemsOpenAs: Schema.optionalKey(Schema.Literals(["dialog", "sidepanel"])),
  pageFullWidth: Schema.optionalKey(Schema.Boolean),
  sidebarConfig: Schema.optionalKey(
    Schema.Unknown.check(
      Schema.makeFilter((value) =>
        typeof value === "object" && value !== null && !Array.isArray(value)
          ? undefined
          : "sidebarConfig must be an object",
      ),
    ),
  ),
});

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

  const parsed = await parseUnknown(UpdateUserSettings, body);
  if (!parsed.ok) {
    return c.json({ error: parsed.message }, 400);
  }

  const patch = parsed.data;
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

  const parsed = await parseJsonBody(c.req, UpdateProfile);

  if (!parsed.ok) {
    return c.json({ error: parsed.message || "Invalid request." }, 400);
  }

  const nextName = parsed.data.name;
  const nextEmail = parsed.data.email;

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

function toUserSettingsPayload(settings: typeof pageSettings.$inferSelect): UserSettingsPayload {
  return {
    embeddedItemsOpenAs: settings.embeddedItemsOpenAs === "dialog" ? "dialog" : "sidepanel",
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
