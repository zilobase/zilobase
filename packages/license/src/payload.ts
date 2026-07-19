import type { Feature, Tier } from "@zilobase/core-ports";

/** The signed contents of a license token. */
export interface LicensePayload {
  /** Payload schema version. */
  readonly v: 1;
  readonly licenseId: string;
  readonly customer: string;
  readonly tier: Tier;
  /** Maximum seats; `null` means unlimited. */
  readonly seats: number | null;
  /** Optional add-on features granted beyond the tier defaults. */
  readonly features?: readonly Feature[];
  /** epoch ms */
  readonly issuedAt: number;
  /** epoch ms; `null` means perpetual. */
  readonly expiresAt: number | null;
}
