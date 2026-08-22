import { and, eq, isNull } from "drizzle-orm";

import { db } from "../../db";
import { database, page, teamspace } from "../../db/schema";

export type TeamspaceSecurityPolicy = {
  exportEnabled: boolean;
  guestsEnabled: boolean;
  publicSharingEnabled: boolean;
  teamspaceId: string;
};

export async function getPageTeamspaceSecurityPolicy(pageId: string) {
  const [record] = await db
    .select({
      exportEnabled: teamspace.exportEnabled,
      guestsEnabled: teamspace.guestsEnabled,
      publicSharingEnabled: teamspace.publicSharingEnabled,
      teamspaceId: teamspace.id,
    })
    .from(page)
    .innerJoin(teamspace, eq(page.teamspaceId, teamspace.id))
    .where(
      and(
        eq(page.id, pageId),
        isNull(page.deletedAt),
        isNull(teamspace.archivedAt),
      ),
    )
    .limit(1);
  return (record as TeamspaceSecurityPolicy | undefined) ?? null;
}

export async function getDatabaseTeamspaceSecurityPolicy(databaseId: string) {
  const [record] = await db
    .select({
      exportEnabled: teamspace.exportEnabled,
      guestsEnabled: teamspace.guestsEnabled,
      publicSharingEnabled: teamspace.publicSharingEnabled,
      teamspaceId: teamspace.id,
    })
    .from(database)
    .innerJoin(teamspace, eq(database.teamspaceId, teamspace.id))
    .where(
      and(
        eq(database.id, databaseId),
        isNull(database.deletedAt),
        isNull(teamspace.archivedAt),
      ),
    )
    .limit(1);
  return (record as TeamspaceSecurityPolicy | undefined) ?? null;
}
