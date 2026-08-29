import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

import { runWithRuntimeAdapter } from "../../infrastructure/runtime/runtime-adapter";
import {
  assertBootstrapToken,
  assertSelfHostedProductionConfiguration,
  bootstrapSelfHostedInstance,
  BootstrapAlreadyCompletedError,
  canManageInstanceSettings,
  decideSelfHostedRegistration,
  InvalidBootstrapTokenError,
  isInvitationUnexpired,
  readInvitationIdFromCookieHeader,
  shouldCreateOpenRegistrationMembership,
  type BootstrapDependencies,
  type BootstrapInput,
} from "./registration";

const bootstrapInput: BootstrapInput = {
  email: "Owner@Example.com",
  name: "Initial Owner",
  password: "a-secure-password",
  workspaceName: "Example Workspace",
};

test("bootstrap token is required and compared exactly", () => {
  const env = { ZILOBASE_BOOTSTRAP_TOKEN: "expected-secret" };

  assert.doesNotThrow(() => assertBootstrapToken(env, "expected-secret"));
  assert.throws(
    () => assertBootstrapToken(env, "wrong-secret"),
    InvalidBootstrapTokenError,
  );
  assert.throws(
    () => assertBootstrapToken(env, null),
    InvalidBootstrapTokenError,
  );
});

test("production self-hosting requires a bootstrap token without changing hosted runtime", async () => {
  assert.throws(
    () => assertSelfHostedProductionConfiguration({ NODE_ENV: "production" }),
    /ZILOBASE_BOOTSTRAP_TOKEN must contain at least 32 characters/,
  );
  assert.throws(
    () =>
      assertSelfHostedProductionConfiguration({
        NODE_ENV: "production",
        ZILOBASE_BOOTSTRAP_TOKEN: "too-short",
      }),
    /at least 32 characters/,
  );
  assert.doesNotThrow(() =>
    assertSelfHostedProductionConfiguration({
      NODE_ENV: "production",
      ZILOBASE_BOOTSTRAP_TOKEN: "a".repeat(32),
    }),
  );

  await runWithRuntimeAdapter({ selfHosted: false }, async () => {
    assert.doesNotThrow(() =>
      assertSelfHostedProductionConfiguration({ NODE_ENV: "production" }),
    );
  });
});

test("concurrent and repeated bootstrap attempts create one administrator", async () => {
  let completed = false;
  let created = 0;
  let tail = Promise.resolve();
  const dependencies: BootstrapDependencies = {
    async ensure() {},
    async execute() {
      let unlock = () => {};
      const previous = tail;
      tail = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      await previous;

      try {
        if (completed) {
          throw new BootstrapAlreadyCompletedError();
        }

        completed = true;
        created += 1;
        return {
          instanceId: "instance-1",
          registrationMode: "invite-only",
          userId: "user-1",
          workspaceId: "workspace-1",
        };
      } finally {
        unlock();
      }
    },
    async hash(password) {
      return `hashed:${password}`;
    },
    async withDatabase(_env, run) {
      return run();
    },
  };
  const env = { ZILOBASE_BOOTSTRAP_TOKEN: "bootstrap-secret" };
  const concurrent = await Promise.allSettled([
    bootstrapSelfHostedInstance(
      env,
      "bootstrap-secret",
      bootstrapInput,
      dependencies,
    ),
    bootstrapSelfHostedInstance(
      env,
      "bootstrap-secret",
      bootstrapInput,
      dependencies,
    ),
  ]);

  assert.equal(
    concurrent.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    concurrent.filter(
      (result) =>
        result.status === "rejected" &&
        result.reason instanceof BootstrapAlreadyCompletedError,
    ).length,
    1,
  );
  await assert.rejects(
    bootstrapSelfHostedInstance(
      env,
      "bootstrap-secret",
      bootstrapInput,
      dependencies,
    ),
    BootstrapAlreadyCompletedError,
  );
  assert.equal(created, 1);
});

test("invite-only registration requires the pinned workspace invitation and email", () => {
  const settings = {
    bootstrapCompleted: true,
    pinnedWorkspaceId: "workspace-1",
    registrationMode: "invite-only" as const,
  };

  assert.equal(
    decideSelfHostedRegistration(
      settings,
      { email: "invitee@example.com" },
      null,
    ).allowed,
    false,
  );
  assert.equal(
    decideSelfHostedRegistration(
      settings,
      { email: "other@example.com", invitationId: "invite-1" },
      { email: "invitee@example.com", id: "invite-1" },
    ).allowed,
    false,
  );
  assert.deepEqual(
    decideSelfHostedRegistration(
      settings,
      { email: "INVITEE@example.com", invitationId: "invite-1" },
      { email: "invitee@example.com", id: "invite-1" },
    ),
    { allowed: true, invitationId: "invite-1" },
  );
});

test("invite-only registration rejects expired invitations", () => {
  const now = new Date("2026-08-14T12:00:00Z");

  assert.equal(isInvitationUnexpired(null, now), true);
  assert.equal(
    isInvitationUnexpired(new Date("2026-08-14T12:00:01Z"), now),
    true,
  );
  assert.equal(
    isInvitationUnexpired(new Date("2026-08-14T12:00:00Z"), now),
    false,
  );
});

test("open registration admits account creation but membership waits for verification", () => {
  const decision = decideSelfHostedRegistration(
    {
      bootstrapCompleted: true,
      pinnedWorkspaceId: "workspace-1",
      registrationMode: "open",
    },
    { email: "new@example.com" },
    null,
  );

  assert.deepEqual(decision, { allowed: true, invitationId: null });
  assert.equal(
    shouldCreateOpenRegistrationMembership({
      emailVerified: false,
      registrationMode: "open",
    }),
    false,
  );
  assert.equal(
    shouldCreateOpenRegistrationMembership({
      emailVerified: true,
      registrationMode: "open",
    }),
    true,
  );
  assert.equal(
    shouldCreateOpenRegistrationMembership({
      emailVerified: true,
      registrationMode: "invite-only",
    }),
    false,
  );
});

test("only the pinned workspace owner can manage instance settings", () => {
  assert.equal(canManageInstanceSettings("owner"), true);
  assert.equal(canManageInstanceSettings("admin"), false);
  assert.equal(canManageInstanceSettings("member"), false);
  assert.equal(canManageInstanceSettings(null), false);
});

test("social registration invitation cookie parsing is strict and tolerant", () => {
  assert.equal(
    readInvitationIdFromCookieHeader(
      "other=value; zilobase_registration_invitation=invite%2F1",
    ),
    "invite/1",
  );
  assert.equal(
    readInvitationIdFromCookieHeader(
      "zilobase_registration_invitation=%E0%A4%A",
    ),
    null,
  );
});

test("registration migration preserves an existing self-hosted workspace", async () => {
  const migration = await readFile(
    new URL(
      "../../../drizzle/0038_self_hosted_registration.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /INSERT INTO "instance_settings"/);
  assert.match(migration, /ORDER BY "workspace"\."created_at"/);
  assert.match(migration, /ON CONFLICT \("id"\) DO UPDATE/);
  assert.match(migration, /CREATE UNIQUE INDEX "member_workspace_user_unique"/);
});
