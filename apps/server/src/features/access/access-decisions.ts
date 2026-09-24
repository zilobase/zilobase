import { accessRank, maxAccess, normalizeAccessLevel, type AccessLevel } from "./access-level";

export type AgentPermissionSnapshotGrant = {
  accessLevel: Exclude<AccessLevel, "none">;
  resourceId: string;
  resourceType: "page" | "database";
};

export function strongestExplicitAccess(rules: Array<{ accessLevel: unknown }>): AccessLevel {
  return rules.reduce<AccessLevel>((best, rule) => {
    const next = normalizeAccessLevel(rule.accessLevel) ?? "none";
    return accessRank[next] > accessRank[best] ? next : best;
  }, "none");
}

export function principalGrantTargets(userId: string, teamIds: string[]) {
  return {
    targetTypes: ["user", ...(teamIds.length ? ["team"] : [])],
    targetIds: [userId, ...teamIds],
  };
}

export function snapshotRootAccess(
  grants: AgentPermissionSnapshotGrant[],
  resourceType: AgentPermissionSnapshotGrant["resourceType"],
  resourceIds: Set<string>,
): AccessLevel {
  return grants.reduce<AccessLevel>((best, grant) => {
    if (grant.resourceType !== resourceType || !resourceIds.has(grant.resourceId)) return best;
    return accessRank[grant.accessLevel] > accessRank[best] ? grant.accessLevel : best;
  }, "none");
}

export function teamspacePrincipalAccess(
  memberAccessLevel: unknown,
  principals: Array<{ role: string; accessLevelOverride: unknown }>,
): AccessLevel {
  return principals.reduce<AccessLevel>((best, principal) => {
    const next =
      principal.role === "owner"
        ? "full"
        : (normalizeAccessLevel(principal.accessLevelOverride) ??
          normalizeAccessLevel(memberAccessLevel) ??
          "none");
    return maxAccess(best, next);
  }, "none");
}
