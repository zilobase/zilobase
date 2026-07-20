import type { Entitlements } from "./entitlements";

export interface EntitlementContext {
  /**
   * In cloud, entitlements are per-workspace (from the subscription), so pass
   * the workspace. Omit for instance-wide resolution (self-host / air-gap,
   * where one license covers the whole instance).
   */
  readonly workspaceId?: string;
}

/**
 * Resolves the active entitlements for a request context. Swapping the resolver
 * is how the same gate code serves every deployment:
 *
 * - self-host / air-gap → offline license token (instance-wide)
 * - online self-host    → activation sync (instance-wide, remote-revocable)
 * - cloud               → subscription lookup (per `workspaceId`)
 *
 * Callers depend only on this interface, never on which one is wired in.
 */
export interface EntitlementResolver {
  resolve(ctx?: EntitlementContext): Promise<Entitlements>;
}
