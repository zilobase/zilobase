import type { DataSession } from "../data/session";
import { entityTimestamp } from "../data/clock";
import { pageCacheEntitySchema } from "./cache-entities";

export function createPageCollection(session: DataSession) {
  return session.register({
    name: "pages",
    schema: pageCacheEntitySchema,
    partialObjects: ["metadata"],
    clock: (page) => {
      if (!page.updatedAt) throw new Error("Page confirmation needs an entity timestamp");
      return entityTimestamp(page.id, page.updatedAt);
    },
  });
}
