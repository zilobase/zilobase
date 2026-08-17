import assert from "node:assert/strict";
import { test } from "vitest";

import {
  createMeetingAudioTicket,
  verifyMeetingAudioTicket,
} from "./meeting-audio-ticket";

const env = { BETTER_AUTH_SECRET: "meeting-ticket-test-secret" };

test("meeting audio tickets are signed and scoped to a recorder lease", async () => {
  const ticket = await createMeetingAudioTicket(
    {
      leaseId: "lease-1",
      meetingId: "meeting-1",
      userId: "user-1",
      workspaceId: "workspace-1",
    },
    env,
  );

  assert.deepEqual(await verifyMeetingAudioTicket(ticket.token, env), {
    exp: Date.parse(ticket.expiresAt),
    leaseId: "lease-1",
    meetingId: "meeting-1",
    userId: "user-1",
    workspaceId: "workspace-1",
  });
});

test("meeting audio tickets reject tampering", async () => {
  const ticket = await createMeetingAudioTicket(
    {
      leaseId: "lease-1",
      meetingId: "meeting-1",
      userId: "user-1",
      workspaceId: "workspace-1",
    },
    env,
  );

  await assert.rejects(
    verifyMeetingAudioTicket(`${ticket.token}x`, env),
    /Invalid meeting audio ticket/,
  );
});
