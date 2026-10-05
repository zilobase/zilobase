import { z } from "zod";

export const entityClockSchema = z
  .object({
    scope: z.enum(["entity", "source", "host", "actor"]),
    id: z.string().min(1),
    revision: z.number().int().nonnegative().safe(),
  })
  .strict();
export type EntityClock = z.infer<typeof entityClockSchema>;

/** Clocks in different lanes have no ordering relation. */
export function compareClocks(left: EntityClock, right: EntityClock) {
  if (left.scope !== right.scope || left.id !== right.id)
    throw new Error(
      `Unrelated confirmation clocks: ${left.scope}/${left.id}, ${right.scope}/${right.id}`,
    );
  return Math.sign(left.revision - right.revision);
}

export function entityTimestamp(id: string, timestamp: string): EntityClock {
  const revision = Date.parse(timestamp);
  return entityClockSchema.parse({ scope: "entity", id, revision });
}
