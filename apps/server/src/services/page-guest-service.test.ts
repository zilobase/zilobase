import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

import {
  canAcceptPageGuestInvitation,
  normalizeGuestEmail,
  PageGuestServiceError,
  parseGuestAccessLevel,
} from "./page-guest-service";

test("page guest inputs normalize email and validate access levels", () => {
  assert.equal(normalizeGuestEmail(" Guest@Example.COM "), "guest@example.com");
  assert.equal(parseGuestAccessLevel("view"), "view");
  assert.equal(parseGuestAccessLevel("edit"), "edit");
  assert.equal(parseGuestAccessLevel("full"), "full");
  assert.throws(
    () => parseGuestAccessLevel("comment"),
    (error) =>
      error instanceof PageGuestServiceError &&
      error.status === 400 &&
      error.message.includes("view, edit, or full"),
  );
});

test("page guest invitations require a pending, unexpired, matching email", () => {
  const now = new Date("2030-01-01T12:00:00.000Z");
  const invitation = {
    email: "guest@example.com",
    expiresAt: new Date("2030-01-02T12:00:00.000Z"),
    status: "pending",
  };

  assert.equal(
    canAcceptPageGuestInvitation(invitation, " Guest@Example.com ", now),
    true,
  );
  assert.equal(
    canAcceptPageGuestInvitation(
      { ...invitation, status: "accepted" },
      invitation.email,
      now,
    ),
    false,
  );
  assert.equal(
    canAcceptPageGuestInvitation(
      { ...invitation, expiresAt: now },
      invitation.email,
      now,
    ),
    false,
  );
  assert.equal(
    canAcceptPageGuestInvitation(invitation, "other@example.com", now),
    false,
  );
});

test("page guest migration enforces explicit principals and invitation states", async () => {
  const migration = await readFile(
    new URL("../../drizzle/0046_page_guests.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /workspace_guest_workspace_user_unique/);
  assert.match(migration, /page_guest_invitation_pending_unique/);
  assert.match(migration, /'pending', 'accepted', 'cancelled', 'expired'/);
  assert.match(migration, /'view', 'edit', 'full'/);
});
