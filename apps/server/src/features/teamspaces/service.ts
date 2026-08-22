import { and, eq, inArray, isNull } from "drizzle-orm";

import { db, type Database } from "../../db";
import { teamspace, teamspacePrincipal } from "../../db/schema";
import type { ZilobaseEditionExtension } from "../../edition-extension";

export const INITIAL_TEAMSPACE_NAME = "General";

export type EnsureDefaultTeamspaceMembershipInput = {
  userId: string;
  workspaceId: string;
};

export type EnsureDefaultTeamspaceMembershipResult = {
  createdTeamspace: boolean;
  membershipsAdded: number;
  teamspaceIds: string[];
};

export class TeamspaceService {
  constructor(
    private readonly database: Database = db,
    private readonly editionExtension?: ZilobaseEditionExtension,
  ) {}

  ensureDefaultMembership(
    input: EnsureDefaultTeamspaceMembershipInput,
  ): Promise<EnsureDefaultTeamspaceMembershipResult> {
    return this.database.transaction((transaction) =>
      ensureDefaultTeamspaceMembership(
        transaction as Database,
        this.editionExtension,
        input,
      ),
    );
  }

  removeUserPrincipals(input: { userId: string; workspaceId: string }) {
    return removeUserTeamspacePrincipals(this.database, input);
  }
}

export async function ensureDefaultTeamspaceMembership(
  database: Database,
  editionExtension: ZilobaseEditionExtension | undefined,
  input: EnsureDefaultTeamspaceMembershipInput,
): Promise<EnsureDefaultTeamspaceMembershipResult> {
  let defaults = await selectActiveDefaults(database, input.workspaceId);
  let createdTeamspace = false;

  if (defaults.length === 0) {
    const [created] = await database
      .insert(teamspace)
      .values({
        accessMode: "closed",
        createdById: input.userId,
        id: crypto.randomUUID(),
        isDefault: true,
        name: INITIAL_TEAMSPACE_NAME,
        workspaceId: input.workspaceId,
      })
      .onConflictDoNothing()
      .returning();

    if (created) {
      createdTeamspace = true;
      defaults = [created];
      await editionExtension?.recordSecurityEvent({
        actorUserId: input.userId,
        database,
        details: { accessMode: "closed", isDefault: true },
        occurredAt: new Date(),
        type: "teamspace.created",
        userId: input.userId,
        workspaceId: input.workspaceId,
      });
    } else {
      defaults = await selectActiveDefaults(database, input.workspaceId);
    }
  }

  if (defaults.length === 0) {
    throw new Error("Default teamspace could not be created");
  }

  let membershipsAdded = 0;

  for (const record of defaults) {
    const [createdPrincipal] = await database
      .insert(teamspacePrincipal)
      .values({
        addedById: input.userId,
        id: crypto.randomUUID(),
        membershipSource: createdTeamspace ? "creator" : "default",
        principalId: input.userId,
        principalType: "user",
        role: createdTeamspace ? "owner" : "member",
        teamspaceId: record.id,
      })
      .onConflictDoNothing()
      .returning();

    if (!createdPrincipal) continue;
    membershipsAdded += 1;
    await editionExtension?.recordSecurityEvent({
      actorUserId: input.userId,
      database,
      details: {
        membershipSource: createdPrincipal.membershipSource,
        role: createdPrincipal.role,
        teamspaceId: record.id,
      },
      occurredAt: new Date(),
      type: "teamspace.principal_added",
      userId: input.userId,
      workspaceId: input.workspaceId,
    });
  }

  return {
    createdTeamspace,
    membershipsAdded,
    teamspaceIds: defaults.map((record) => record.id),
  };
}

export async function removeUserTeamspacePrincipals(
  database: Database,
  input: { userId: string; workspaceId: string },
) {
  const workspaceTeamspaces = database
    .select({ id: teamspace.id })
    .from(teamspace)
    .where(eq(teamspace.workspaceId, input.workspaceId));

  return database
    .delete(teamspacePrincipal)
    .where(
      and(
        eq(teamspacePrincipal.principalType, "user"),
        eq(teamspacePrincipal.principalId, input.userId),
        inArray(teamspacePrincipal.teamspaceId, workspaceTeamspaces),
      ),
    );
}

function selectActiveDefaults(database: Database, workspaceId: string) {
  return database
    .select()
    .from(teamspace)
    .where(
      and(
        eq(teamspace.workspaceId, workspaceId),
        eq(teamspace.isDefault, true),
        isNull(teamspace.archivedAt),
      ),
    );
}
