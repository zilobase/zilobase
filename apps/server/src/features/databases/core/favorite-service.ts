import { and, eq } from "drizzle-orm";

import { db } from "../../../infrastructure/database";
import { favorite } from "../../../infrastructure/database/schema";
import { requireDatabaseAccess } from "../access/database-access";
import { getDatabasePayload } from "./payload";

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
