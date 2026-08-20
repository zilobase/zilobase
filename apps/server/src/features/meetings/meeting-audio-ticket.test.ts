import assert from "node:assert/strict";
import { test } from "vitest";

import {
  createMeetingAudioTicket,
  MEETING_AUDIO_PROTOCOL,
  meetingAudioSourceCode,
  meetingAudioSourceFromCode,
  meetingTranscriptSequence,
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

test("meeting audio v2 keeps simultaneous sources in distinct ordered lanes", () => {
  assert.equal(MEETING_AUDIO_PROTOCOL, "zilobase.meeting-audio.v2");
  assert.equal(meetingAudioSourceCode("microphone"), 0);
  assert.equal(meetingAudioSourceCode("system"), 1);
  assert.equal(meetingAudioSourceFromCode(0), "microphone");
  assert.equal(meetingAudioSourceFromCode(1), "system");
  assert.equal(meetingAudioSourceFromCode(2), null);
  assert.equal(meetingTranscriptSequence("microphone", 42), 84);
  assert.equal(meetingTranscriptSequence("system", 42), 85);
});
