import { db, type Database } from "../../db";
import {
  member,
  page,
  pageItemPlacement,
  team,
  teamspace,
  teamspacePrincipal,
  workspace,
} from "../../db/schema";

export type TeamspaceIntegrityIssue = {
  code:
    | "archived_default"
    | "invalid_principal"
    | "invite_link_missing_token"
    | "missing_default"
    | "ownerless_teamspace"
    | "page_scope_drift";
  id: string;
  message: string;
  workspaceId: string;
};

export type TeamspaceIntegritySnapshot = {
  members: Array<{ userId: string; workspaceId: string }>;
  pages: Array<{ id: string; teamspaceId: string | null; workspaceId: string }>;
  placements: Array<{
    deleted: boolean;
    itemId: string;
    itemKind: string;
    parentId: string;
    parentKind: string;
    placementKind: string;
  }>;
  principals: Array<{
    id: string;
    principalId: string;
    principalType: string;
    role: string;
    teamspaceId: string;
  }>;
  teams: Array<{ id: string; workspaceId: string }>;
  teamspaces: Array<{
    archived: boolean;
    id: string;
    inviteLinkEnabled: boolean;
    inviteLinkTokenHash: string | null;
    isDefault: boolean;
    workspaceId: string;
  }>;
  workspaces: Array<{ id: string }>;
};

export function findTeamspaceIntegrityIssues(
  snapshot: TeamspaceIntegritySnapshot,
): TeamspaceIntegrityIssue[] {
  const teamspacesById = new Map(
    snapshot.teamspaces.map((record) => [record.id, record]),
  );
  const pagesById = new Map(snapshot.pages.map((record) => [record.id, record]));
  const memberKeys = new Set(
    snapshot.members.map((record) => `${record.workspaceId}:${record.userId}`),
  );
  const teamKeys = new Set(
    snapshot.teams.map((record) => `${record.workspaceId}:${record.id}`),
  );
  const ownerTeamspaceIds = new Set(
    snapshot.principals
      .filter((record) => record.role === "owner")
      .map((record) => record.teamspaceId),
  );

  return [
    ...findWorkspaceDefaultIssues(snapshot),
    ...findTeamspaceRecordIssues(snapshot.teamspaces, ownerTeamspaceIds),
    ...findPrincipalIssues(snapshot.principals, {
      memberKeys,
      teamKeys,
      teamspacesById,
    }),
    ...findPlacementIssues(snapshot.placements, pagesById),
  ];
}

function findWorkspaceDefaultIssues(
  snapshot: TeamspaceIntegritySnapshot,
): TeamspaceIntegrityIssue[] {
  return snapshot.workspaces
    .filter(
      (workspaceRecord) =>
        !snapshot.teamspaces.some(
          (record) =>
            record.workspaceId === workspaceRecord.id &&
            record.isDefault &&
            !record.archived,
        ),
    )
    .map((workspaceRecord) => ({
      code: "missing_default",
      id: workspaceRecord.id,
      message: "Workspace has no active default teamspace.",
      workspaceId: workspaceRecord.id,
    }));
}

function findTeamspaceRecordIssues(
  teamspaces: TeamspaceIntegritySnapshot["teamspaces"],
  ownerTeamspaceIds: Set<string>,
): TeamspaceIntegrityIssue[] {
  const issues: TeamspaceIntegrityIssue[] = [];

  for (const record of teamspaces) {
    if (record.archived && record.isDefault) {
      issues.push({
        code: "archived_default",
        id: record.id,
        message: "Archived teamspace is still marked as default.",
        workspaceId: record.workspaceId,
      });
    }
    if (!record.archived && !ownerTeamspaceIds.has(record.id)) {
      issues.push({
        code: "ownerless_teamspace",
        id: record.id,
        message: "Active teamspace has no owner principal.",
        workspaceId: record.workspaceId,
      });
    }
    if (record.inviteLinkEnabled && !record.inviteLinkTokenHash) {
      issues.push({
        code: "invite_link_missing_token",
        id: record.id,
        message: "Invite link is enabled without a token hash.",
        workspaceId: record.workspaceId,
      });
    }
  }

  return issues;
}

function findPrincipalIssues(
  principals: TeamspaceIntegritySnapshot["principals"],
  lookup: {
    memberKeys: Set<string>;
    teamKeys: Set<string>;
    teamspacesById: Map<
      string,
      TeamspaceIntegritySnapshot["teamspaces"][number]
    >;
  },
): TeamspaceIntegrityIssue[] {
  const issues: TeamspaceIntegrityIssue[] = [];

  for (const principal of principals) {
    const teamspaceRecord = lookup.teamspacesById.get(principal.teamspaceId);
    if (!teamspaceRecord) continue;
    if (isPrincipalInWorkspace(principal, teamspaceRecord, lookup)) continue;

    issues.push({
      code: "invalid_principal",
      id: principal.id,
      message: "Teamspace principal is outside the workspace.",
      workspaceId: teamspaceRecord.workspaceId,
    });
  }

  return issues;
}

function isPrincipalInWorkspace(
  principal: TeamspaceIntegritySnapshot["principals"][number],
  teamspaceRecord: TeamspaceIntegritySnapshot["teamspaces"][number],
  lookup: { memberKeys: Set<string>; teamKeys: Set<string> },
) {
  const key = `${teamspaceRecord.workspaceId}:${principal.principalId}`;
  if (principal.principalType === "user") return lookup.memberKeys.has(key);
  if (principal.principalType === "team") return lookup.teamKeys.has(key);
  return false;
}

function findPlacementIssues(
  placements: TeamspaceIntegritySnapshot["placements"],
  pagesById: Map<string, TeamspaceIntegritySnapshot["pages"][number]>,
): TeamspaceIntegrityIssue[] {
  const issues: TeamspaceIntegrityIssue[] = [];

  for (const placement of placements) {
    if (!isPrimaryPagePlacement(placement)) continue;
    const parent = pagesById.get(placement.parentId);
    const child = pagesById.get(placement.itemId);
    if (!parent || !child || parent.teamspaceId === child.teamspaceId) continue;

    issues.push({
      code: "page_scope_drift",
      id: child.id,
      message: "Child page does not share its primary parent's teamspace scope.",
      workspaceId: child.workspaceId,
    });
  }

  return issues;
}

function isPrimaryPagePlacement(
  placement: TeamspaceIntegritySnapshot["placements"][number],
) {
  return (
    !placement.deleted &&
    placement.parentKind === "page" &&
    placement.itemKind === "page" &&
    placement.placementKind === "primary"
  );
}

export async function inspectTeamspaceIntegrity(
  database: Database = db,
): Promise<TeamspaceIntegrityIssue[]> {
  const [
    workspaceRows,
    teamspaceRows,
    principalRows,
    memberRows,
    teamRows,
    pageRows,
    placementRows,
  ] = await Promise.all([
    database.select({ id: workspace.id }).from(workspace),
    database
      .select({
        archivedAt: teamspace.archivedAt,
        id: teamspace.id,
        inviteLinkEnabled: teamspace.inviteLinkEnabled,
        inviteLinkTokenHash: teamspace.inviteLinkTokenHash,
        isDefault: teamspace.isDefault,
        workspaceId: teamspace.workspaceId,
      })
      .from(teamspace),
    database
      .select({
        id: teamspacePrincipal.id,
        principalId: teamspacePrincipal.principalId,
        principalType: teamspacePrincipal.principalType,
        role: teamspacePrincipal.role,
        teamspaceId: teamspacePrincipal.teamspaceId,
      })
      .from(teamspacePrincipal),
    database
      .select({ userId: member.userId, workspaceId: member.organizationId })
      .from(member),
    database.select({ id: team.id, workspaceId: team.organizationId }).from(team),
    database
      .select({
        id: page.id,
        teamspaceId: page.teamspaceId,
        workspaceId: page.workspaceId,
      })
      .from(page),
    database
      .select({
        deletedAt: pageItemPlacement.deletedAt,
        itemId: pageItemPlacement.itemId,
        itemKind: pageItemPlacement.itemKind,
        parentId: pageItemPlacement.parentId,
        parentKind: pageItemPlacement.parentKind,
        placementKind: pageItemPlacement.placementKind,
      })
      .from(pageItemPlacement),
  ]);

  return findTeamspaceIntegrityIssues({
    members: memberRows,
    pages: pageRows,
    placements: placementRows.map((record) => ({
      ...record,
      deleted: Boolean(record.deletedAt),
    })),
    principals: principalRows,
    teams: teamRows,
    teamspaces: teamspaceRows.map((record) => ({
      ...record,
      archived: Boolean(record.archivedAt),
    })),
    workspaces: workspaceRows,
  });
}
