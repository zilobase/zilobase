import { describe, expect, it } from "vitest";

import {
  MAX_TEMPORARY_ACCESS_MS,
  parseMembershipAccessExpiry,
  TemporaryMembershipValidationError,
} from "./temporary-membership";

const now = new Date("2026-08-22T00:00:00.000Z");

describe("parseMembershipAccessExpiry", () => {
  it("requires temporary memberships to expire in the future", () => {
    expect(() => parseMembershipAccessExpiry("temporary", null, now)).toThrow(
      TemporaryMembershipValidationError,
    );
    expect(() =>
      parseMembershipAccessExpiry("temporary", now.toISOString(), now),
    ).toThrow("must expire in the future");
  });

  it("accepts a temporary membership ending within one year", () => {
    const expiresAt = new Date(now.getTime() + MAX_TEMPORARY_ACCESS_MS);

    expect(
      parseMembershipAccessExpiry("temporary", expiresAt.toISOString(), now),
    ).toEqual(expiresAt);
  });

  it("rejects a temporary membership longer than one year", () => {
    const expiresAt = new Date(now.getTime() + MAX_TEMPORARY_ACCESS_MS + 1);

    expect(() =>
      parseMembershipAccessExpiry("temporary", expiresAt, now),
    ).toThrow("cannot exceed one year");
  });

  it("forbids expiration on permanent roles", () => {
    expect(parseMembershipAccessExpiry("member", null, now)).toBeNull();
    expect(() =>
      parseMembershipAccessExpiry("admin", "2026-09-22T00:00:00.000Z", now),
    ).toThrow("Only temporary members");
  });
});
