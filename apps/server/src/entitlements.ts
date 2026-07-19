import type { Entitlements } from "@zilobase/core-ports";
import { loadEntitlements } from "@zilobase/license";

/**
 * The instance's current entitlements, derived from its license token.
 *
 * The token is read from `ZILOBASE_LICENSE` (env) for now; once the admin
 * console can upload a key, `reloadEntitlements` lets us swap it at runtime
 * without a restart. A missing/invalid/expired token falls back to Community.
 */
let cached: Entitlements | null = null;

export function getEntitlements(): Entitlements {
  if (!cached) {
    cached = loadEntitlements(process.env.ZILOBASE_LICENSE ?? null);
  }
  return cached;
}

export function reloadEntitlements(token: string | null): Entitlements {
  cached = loadEntitlements(token);
  return cached;
}
