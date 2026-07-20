import type { Feature, Tier } from "./feature";

/**
 * The read-only view of what a running instance (self-host) or workspace
 * (cloud) is allowed to do. This is the only licensing surface the rest of the
 * codebase depends on — how it is produced (offline license token, online
 * activation sync, or cloud subscription) stays hidden behind the resolver.
 */
export interface Entitlements {
  readonly tier: Tier;
  /** Maximum seats; `null` means unlimited (Community / self-host). */
  readonly seats: number | null;
  readonly features: readonly Feature[];
  /** License expiry (epoch ms); `null` means perpetual / not applicable. */
  readonly expiresAt: number | null;
  /** True when this is a time-limited trial (still fully functional). */
  readonly isTrial: boolean;
  /** Feature-level gate: does this tier/add-on include the capability? */
  has(feature: Feature): boolean;
  /** Tier-level gate: is the active tier >= the required tier? */
  atLeast(tier: Tier): boolean;
  withinSeatLimit(activeUsers: number): boolean;
}
