import type { BetterAuthPlugin } from "better-auth";
import type { Hono } from "hono";

import type { Database } from "./db";
import type { AppBindings } from "./types";

export const MEMBERSHIP_GRANT_SOURCES = [
  "bootstrap",
  "open-registration",
  "invitation",
  "admin",
  "sso-jit",
  "scim",
] as const;

export type MembershipGrantSource =
  (typeof MEMBERSHIP_GRANT_SOURCES)[number];

export type MembershipGrantInput = {
  database: Database;
  role: string;
  source: MembershipGrantSource;
  userId: string;
  workspaceId: string;
};

export type SecurityEvent = {
  actorUserId?: string | null;
  database: Database;
  details?: Record<string, boolean | number | string | null>;
  occurredAt: Date;
  type: string;
  userId?: string | null;
  workspaceId?: string | null;
};

export type ZilobaseEditionExtension = {
  readonly id: "enterprise";
  readonly capabilities: readonly string[];
  readonly authPlugins: readonly BetterAuthPlugin[];
  registerRoutes(app: Hono<AppBindings>): void;
  beforeMembershipGrant(input: MembershipGrantInput): Promise<void>;
  recordSecurityEvent(event: SecurityEvent): Promise<void>;
};

export type EditionExtensionOptions = {
  editionExtension?: ZilobaseEditionExtension;
};
