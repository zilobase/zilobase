import { createHash, timingSafeEqual } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

import { getStringEnv, type RuntimeEnv } from "../../shared/config/config";
import { db, runWithDbEnv, type Database } from "../../infrastructure/database";
import {
  account,
  instanceSettings,
  invitation,
  pageGuestInvitation,
  user,
  workspace,
} from "../../infrastructure/database/schema";
import type {
  EditionExtensionOptions,
  ZilobaseEditionExtension,
} from "../../shared/types";
import { MembershipService } from "../../services/membership-service";
import { isSelfHostedRuntime } from "../../infrastructure/runtime/runtime-adapter";
import {
  ensureInstanceSettings,
  INSTANCE_SETTINGS_ROW_ID,
} from "./service";

const REGISTRATION_MODES = ["invite-only", "open"] as const;
export const SELF_HOSTED_INVITATION_COOKIE = "zilobase_registration_invitation";
export type RegistrationMode = (typeof REGISTRATION_MODES)[number];

export type InstanceAdministrationSettings = {
  bootstrapCompleted: boolean;
  displayName: string;
  instanceId: string;
  pinnedWorkspaceId: string | null;
  registrationMode: RegistrationMode;
};

export type BootstrapInput = {
  email: string;
  name: string;
  password: string;
  workspaceName: string;
};

export type BootstrapResult = {
  instanceId: string;
  registrationMode: RegistrationMode;
  userId: string;
  workspaceId: string;
};

export type RegistrationDecision =
  | { allowed: true; invitationId: string | null }
  | {
      allowed: false;
      code: "bootstrap_required" | "invitation_required" | "invalid_invitation";
      message: string;
    };

export class BootstrapAlreadyCompletedError extends Error {
  constructor() {
    super("This Zilobase instance has already been bootstrapped.");
    this.name = "BootstrapAlreadyCompletedError";
  }
}

export class BootstrapStateConflictError extends Error {
  constructor() {
    super(
      "Existing users or workspaces prevent automatic bootstrap. Restore the matching instance settings or start with an empty database.",
    );
    this.name = "BootstrapStateConflictError";
  }
}

export class InvalidBootstrapTokenError extends Error {
  constructor() {
    super("The bootstrap token is invalid.");
    this.name = "InvalidBootstrapTokenError";
  }
}

type BootstrapDependencies = {
  ensure(env: RuntimeEnv): Promise<unknown>;
  execute(
    input: BootstrapInput & { passwordHash: string },
    editionExtension?: ZilobaseEditionExtension,
  ): Promise<BootstrapResult>;
  hash(password: string): Promise<string>;
  withDatabase<T>(env: RuntimeEnv, run: () => Promise<T>): Promise<T>;
};

const databaseBootstrapDependencies: BootstrapDependencies = {
  ensure: (env) => ensureInstanceSettings(env),
  execute: executeDatabaseBootstrap,
  hash: hashPassword,
  withDatabase: (env, run) => runWithDbEnv(env, run),
};

export async function bootstrapSelfHostedInstance(
  env: RuntimeEnv,
  suppliedToken: string | null,
  input: BootstrapInput,
  dependencies: BootstrapDependencies = databaseBootstrapDependencies,
  options: EditionExtensionOptions = {},
) {
  assertBootstrapToken(env, suppliedToken);
  return dependencies.withDatabase(env, async () => {
    await dependencies.ensure(env);

    const passwordHash = await dependencies.hash(input.password);
    return dependencies.execute(
      { ...input, passwordHash },
      options.editionExtension,
    );
  });
}

export function assertSelfHostedProductionConfiguration(env: RuntimeEnv) {
  const bootstrapToken = getStringEnv(env, "ZILOBASE_BOOTSTRAP_TOKEN");

  if (
    isSelfHostedRuntime() &&
    getStringEnv(env, "NODE_ENV") === "production" &&
    (!bootstrapToken || bootstrapToken.length < 32)
  ) {
    throw new Error(
      "ZILOBASE_BOOTSTRAP_TOKEN must contain at least 32 characters for a production self-hosted deployment",
    );
  }
}

export function assertBootstrapToken(
  env: RuntimeEnv,
  suppliedToken: string | null,
) {
  const expectedToken = getStringEnv(env, "ZILOBASE_BOOTSTRAP_TOKEN");

  if (!expectedToken) {
    throw new Error("ZILOBASE_BOOTSTRAP_TOKEN is required");
  }

  if (!suppliedToken || !constantTimeTextEqual(expectedToken, suppliedToken)) {
    throw new InvalidBootstrapTokenError();
  }
}

export function readInvitationIdFromCookieHeader(cookieHeader: string | null) {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");

    if (separator < 0) continue;

    const name = part.slice(0, separator).trim();

    if (name !== SELF_HOSTED_INVITATION_COOKIE) continue;

    try {
      return decodeURIComponent(part.slice(separator + 1).trim()) || null;
    } catch {
      return null;
    }
  }

  return null;
}

export async function getInstanceAdministrationSettings(env: RuntimeEnv) {
  await ensureInstanceSettings(env);

  const [settings] = await db
    .select({
      bootstrapCompletedAt: instanceSettings.bootstrapCompletedAt,
      displayName: instanceSettings.displayName,
      instanceId: instanceSettings.instanceId,
      pinnedWorkspaceId: instanceSettings.pinnedWorkspaceId,
      registrationMode: instanceSettings.registrationMode,
    })
    .from(instanceSettings)
    .where(eq(instanceSettings.id, INSTANCE_SETTINGS_ROW_ID))
    .limit(1);

  if (!settings) {
    throw new Error("Instance settings are unavailable");
  }

  return {
    bootstrapCompleted: Boolean(settings.bootstrapCompletedAt),
    displayName: settings.displayName,
    instanceId: settings.instanceId,
    pinnedWorkspaceId: settings.pinnedWorkspaceId,
    registrationMode: parseRegistrationMode(settings.registrationMode),
  } satisfies InstanceAdministrationSettings;
}

export async function updateInstanceAdministrationSettings(input: {
  displayName?: string;
  registrationMode?: RegistrationMode;
}) {
  const [settings] = await db
    .update(instanceSettings)
    .set({
      ...(input.displayName === undefined
        ? {}
        : { displayName: input.displayName }),
      ...(input.registrationMode === undefined
        ? {}
        : { registrationMode: input.registrationMode }),
      updatedAt: new Date(),
    })
    .where(eq(instanceSettings.id, INSTANCE_SETTINGS_ROW_ID))
    .returning({
      displayName: instanceSettings.displayName,
      registrationMode: instanceSettings.registrationMode,
    });

  if (!settings) {
    throw new Error("Instance settings are unavailable");
  }

  return {
    displayName: settings.displayName,
    registrationMode: parseRegistrationMode(settings.registrationMode),
  };
}

export async function evaluateSelfHostedRegistration(
  env: RuntimeEnv,
  input: { email: string; invitationId?: string | null },
): Promise<RegistrationDecision> {
  if (!isSelfHostedRuntime()) {
    return { allowed: true, invitationId: null };
  }

  const settings = await getInstanceAdministrationSettings(env);

  const candidate =
    input.invitationId && settings.pinnedWorkspaceId
      ? await getPendingPinnedInvitation(
          input.invitationId,
          settings.pinnedWorkspaceId,
        )
      : null;

  return decideSelfHostedRegistration(settings, input, candidate);
}

export function decideSelfHostedRegistration(
  settings: Pick<
    InstanceAdministrationSettings,
    "bootstrapCompleted" | "pinnedWorkspaceId" | "registrationMode"
  >,
  input: { email: string; invitationId?: string | null },
  invitationCandidate: { email: string; id: string } | null,
): RegistrationDecision {
  if (!settings.bootstrapCompleted || !settings.pinnedWorkspaceId) {
    return {
      allowed: false,
      code: "bootstrap_required",
      message: "This Zilobase instance must be bootstrapped before registration.",
    };
  }

  if (settings.registrationMode === "open") {
    return { allowed: true, invitationId: null };
  }

  if (!input.invitationId) {
    return {
      allowed: false,
      code: "invitation_required",
      message: "A valid invitation is required to create an account.",
    };
  }

  if (
    !invitationCandidate ||
    normalizeEmail(invitationCandidate.email) !== normalizeEmail(input.email)
  ) {
    return invalidInvitationDecision();
  }

  return { allowed: true, invitationId: invitationCandidate.id };
}

export function shouldCreateOpenRegistrationMembership(input: {
  emailVerified: boolean;
  registrationMode: RegistrationMode;
}) {
  return input.emailVerified && input.registrationMode === "open";
}

export function canManageInstanceSettings(role: string | null | undefined) {
  return role === "owner";
}

export function isInvitationUnexpired(expiresAt: Date | null, now = new Date()) {
  return !expiresAt || expiresAt.getTime() > now.getTime();
}

export async function validateSelfHostedInvitationCandidate(
  env: RuntimeEnv,
  invitationId: string | null,
): Promise<RegistrationDecision> {
  if (!isSelfHostedRuntime()) {
    return { allowed: true, invitationId: null };
  }

  const settings = await getInstanceAdministrationSettings(env);

  if (!settings.bootstrapCompleted || !settings.pinnedWorkspaceId) {
    return {
      allowed: false,
      code: "bootstrap_required",
      message: "This Zilobase instance must be bootstrapped before registration.",
    };
  }

  if (settings.registrationMode === "open") {
    return { allowed: true, invitationId: null };
  }

  if (!invitationId) {
    return {
      allowed: false,
      code: "invitation_required",
      message: "A valid invitation is required to create an account.",
    };
  }

  const candidate = await getPendingPinnedInvitation(
    invitationId,
    settings.pinnedWorkspaceId,
  );

  return candidate
    ? { allowed: true, invitationId: candidate.id }
    : invalidInvitationDecision();
}

async function executeDatabaseBootstrap(
  input: BootstrapInput & { passwordHash: string },
  editionExtension?: ZilobaseEditionExtension,
) {
  return db.transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext('zilobase-initial-bootstrap'))`,
    );

    const [settings] = await transaction
      .select({
        bootstrapCompletedAt: instanceSettings.bootstrapCompletedAt,
        instanceId: instanceSettings.instanceId,
      })
      .from(instanceSettings)
      .where(eq(instanceSettings.id, INSTANCE_SETTINGS_ROW_ID))
      .for("update")
      .limit(1);

    if (!settings) {
      throw new Error("Instance settings are unavailable");
    }

    if (settings.bootstrapCompletedAt) {
      throw new BootstrapAlreadyCompletedError();
    }

    const [[existingUser], [existingWorkspace]] = await Promise.all([
      transaction.select({ id: user.id }).from(user).limit(1),
      transaction.select({ id: workspace.id }).from(workspace).limit(1),
    ]);

    if (existingUser || existingWorkspace) {
      throw new BootstrapStateConflictError();
    }

    const userId = crypto.randomUUID();
    const workspaceId = crypto.randomUUID();
    const now = new Date();

    await transaction.insert(user).values({
      createdAt: now,
      email: normalizeEmail(input.email),
      emailVerified: true,
      id: userId,
      name: input.name,
      updatedAt: now,
    });
    await transaction.insert(account).values({
      accountId: userId,
      createdAt: now,
      id: crypto.randomUUID(),
      password: input.passwordHash,
      providerId: "credential",
      updatedAt: now,
      userId,
    });
    await transaction.insert(workspace).values({
      createdAt: now,
      id: workspaceId,
      name: input.workspaceName,
      slug: "zilobase",
      updatedAt: now,
    });
    await new MembershipService(
      transaction as Database,
      editionExtension,
    ).grantMembership({
      role: "owner",
      source: "bootstrap",
      userId,
      workspaceId,
    });
    await transaction
      .update(instanceSettings)
      .set({
        bootstrapCompletedAt: now,
        displayName: input.workspaceName,
        pinnedWorkspaceId: workspaceId,
        registrationMode: "invite-only",
        updatedAt: now,
      })
      .where(eq(instanceSettings.id, INSTANCE_SETTINGS_ROW_ID));

    return {
      instanceId: settings.instanceId,
      registrationMode: "invite-only" as const,
      userId,
      workspaceId,
    };
  });
}

async function getPendingPinnedInvitation(
  invitationId: string,
  pinnedWorkspaceId: string,
) {
  const [candidate] = await db
    .select({
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      id: invitation.id,
    })
    .from(invitation)
    .where(
      and(
        eq(invitation.id, invitationId),
        eq(invitation.organizationId, pinnedWorkspaceId),
        eq(invitation.status, "pending"),
      ),
    )
    .limit(1);

  if (candidate && isInvitationUnexpired(candidate.expiresAt)) {
    return candidate;
  }

  const [pageGuestCandidate] = await db
    .select({
      email: pageGuestInvitation.email,
      expiresAt: pageGuestInvitation.expiresAt,
      id: pageGuestInvitation.id,
    })
    .from(pageGuestInvitation)
    .where(
      and(
        eq(pageGuestInvitation.id, invitationId),
        eq(pageGuestInvitation.workspaceId, pinnedWorkspaceId),
        eq(pageGuestInvitation.status, "pending"),
      ),
    )
    .limit(1);

  return pageGuestCandidate &&
    isInvitationUnexpired(pageGuestCandidate.expiresAt)
    ? pageGuestCandidate
    : null;
}

function invalidInvitationDecision(): RegistrationDecision {
  return {
    allowed: false,
    code: "invalid_invitation",
    message: "The invitation is invalid, expired, or belongs to another email.",
  };
}

function parseRegistrationMode(value: string): RegistrationMode {
  if (value === "invite-only" || value === "open") {
    return value;
  }

  throw new Error("Instance registration mode is invalid");
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function constantTimeTextEqual(expected: string, actual: string) {
  const expectedDigest = createHash("sha256").update(expected).digest();
  const actualDigest = createHash("sha256").update(actual).digest();

  return timingSafeEqual(expectedDigest, actualDigest);
}

export type { BootstrapDependencies };
