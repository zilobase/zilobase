import type { Feature, Tier } from "./feature.ts";

/**
 * The read-only view of what a running instance is allowed to do. This is the
 * only licensing surface the rest of the codebase depends on — the concrete
 * implementation and the signing/verification details live in
 * `@zilobase/license` and stay hidden behind this interface.
 */
export interface Entitlements {
  readonly tier: Tier;
  /** Maximum seats; `null` means unlimited (Community / self-host). */
  readonly seats: number | null;
  readonly features: readonly Feature[];
  /** License expiry (epoch ms); `null` means perpetual / not applicable. */
  readonly expiresAt: number | null;
  has(feature: Feature): boolean;
  withinSeatLimit(activeUsers: number): boolean;
}
