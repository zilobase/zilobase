import { and, eq } from "drizzle-orm";

import { db } from "../db";
import { favorite } from "../db/schema";
import { requireDatabaseAccess } from "./database-access";
import { getDatabasePayload } from "./database-payload";

export async function updateDatabaseFavoriteService(input: {
  databaseId: string;
  favorite: boolean;
  userId: string;
}) {
  const existing = await requireDatabaseAccess(
    input.databaseId,
    input.userId,
    "view",
  );

  if (input.favorite) {
    await db
      .insert(favorite)
      .values({
        databaseId: existing.id,
        id: crypto.randomUUID(),
        userId: input.userId,
      })
      .onConflictDoNothing({
        target: [favorite.userId, favorite.databaseId],
      });
  } else {
    await db
      .delete(favorite)
      .where(
        and(
          eq(favorite.userId, input.userId),
          eq(favorite.databaseId, existing.id),
        ),
      );
  }

  return getDatabasePayload(existing.id, input.userId, existing);
}
