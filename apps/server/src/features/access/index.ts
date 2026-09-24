export {
  canAgentSnapshotAccessDatabase,
  canAgentSnapshotAccessPage,
  canAccessDatabaseInWorkspace,
  canAccessDatabaseRecord,
  canAgentAccessDatabase,
  canAgentAccessPage,
  canAccessPage,
  canAccessPageInWorkspace,
  getAccessiblePageIds,
  getEffectiveDatabaseAccessForRecord,
  getEffectiveDatabaseAccessForAgent,
  getEffectiveDatabaseAccessInWorkspace,
  getEffectivePageAccessForUsers,
  getEffectivePageAccessForAgent,
  getEffectivePageAccessInWorkspace,
  getEffectiveTeamspaceAccessInWorkspace,
  isDatabasePublishedInWorkspace,
  isPagePublishedInWorkspace,
  type DatabaseAccessRecord,
} from "./effective-access";
export {
  getMembership,
  getWorkspaceMemberships,
  getWorkspacePrincipalKind,
  getWorkspaceRealtimeAccessExpiration,
  isPrivilegedOrgRole,
  isWorkspaceMember,
} from "./principal-access";
export { hasAccess, normalizeAccessLevel, type AccessLevel } from "./access-level";
export { rejectActiveWorkspaceMismatch } from "./workspace-mismatch";
export type { AgentPermissionSnapshotGrant } from "./access-decisions";
export { getPageRecord } from "./resource-access-records";
