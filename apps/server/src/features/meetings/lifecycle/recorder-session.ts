import { and, desc, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";

import type { RuntimeEnv } from "../../../shared/config/config";
import { db } from "../../../infrastructure/database";
import {
  meeting,
  meetingConsentEvent,
} from "../../../infrastructure/database/schema";

import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";
import { getRuntimePorts } from "../../../infrastructure/runtime/runtime-adapter";
import {
  clampMeetingDuration,
  isMeetingRecordingActive,
} from "./meeting-state";
import type { MeetingStatus } from "../contracts/meeting-types";
import { getMeetingForUser } from "./meeting-access";
import { runRecorderRuntimeMutation } from "./recorder-runtime";

const RECORDER_LEASE_MS = 90_000;

export const MEETING_RECORDER_LEASE_HEARTBEAT_MS = 60_000;

export async function claimMeetingRecorder(input: {
  env?: RuntimeEnv;
  meetingId: string;
  recorderImage?: string | null;
  recorderName?: string;
  userId: string;
}) {
  const existing = await getMeetingForUser(
    input.meetingId,
    input.userId,
    "edit",
  );
  const now = new Date();
  const runtime = input.env
    ? getRuntimePorts().meetings
    : undefined;

  // A serverful process can disappear before its audio socket sends stop. The
  // database lease is the durable recovery boundary: when the next recorder
  // observes an expired active lease, archive the partial transcript instead
  // of leaving the meeting permanently stuck in recording/paused.
  if (
    !runtime &&
    isMeetingRecordingActive(existing.status as MeetingStatus) &&
    (!existing.recorderLeaseExpiresAt || existing.recorderLeaseExpiresAt <= now)
  ) {
    const [recovered] = await db
      .update(meeting)
      .set({
        durationMs: clampMeetingDuration(
          existing.recordingStartedAt
            ? now.getTime() - existing.recordingStartedAt.getTime()
            : existing.durationMs,
        ),
        recorderId: null,
        recorderLeaseExpiresAt: null,
        recorderLeaseId: null,
        recordingStoppedAt: now,
        status: "processing",
        updatedAt: now,
      })
      .where(
        and(
          eq(meeting.id, existing.id),
          inArray(meeting.status, ["recording", "paused"]),
          or(
            isNull(meeting.recorderLeaseExpiresAt),
            lt(meeting.recorderLeaseExpiresAt, now),
          ),
        ),
      )
      .returning({ id: meeting.id });
    if (recovered) {
      throw new ServiceMutationError(
        "The interrupted recording was recovered; generate its summary before starting another meeting",
        409,
      );
    }
  }
  const [consent] = await db
    .select({ acknowledgedAt: meetingConsentEvent.acknowledgedAt })
    .from(meetingConsentEvent)
    .where(
      and(
        eq(meetingConsentEvent.meetingId, existing.id),
        eq(meetingConsentEvent.userId, input.userId),
        gt(
          meetingConsentEvent.acknowledgedAt,
          new Date(now.getTime() - 10 * 60 * 1_000),
        ),
      ),
    )
    .orderBy(desc(meetingConsentEvent.acknowledgedAt))
    .limit(1);
  if (!consent) {
    throw new ServiceMutationError(
      "Confirm that participants were notified before recording",
      409,
    );
  }
  if (runtime) {
    const claimed = await runRecorderRuntimeMutation(() =>
      runtime.claim({
        meetingId: existing.id,
        recorderImage: input.recorderImage,
        recorderName: input.recorderName,
        userId: input.userId,
        workspaceId: existing.workspaceId,
      }),
    );
    return {
      leaseExpiresAt: new Date(claimed.expiresAt),
      leaseId: claimed.leaseId,
      meeting: {
        ...existing,
        recorderId: claimed.recorderId,
        recorderLeaseExpiresAt: new Date(claimed.expiresAt),
        recorderLeaseId: claimed.leaseId,
      },
    };
  }
  const leaseId = crypto.randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + RECORDER_LEASE_MS);
  const [claimed] = await db
    .update(meeting)
    .set({
      recorderId: input.userId,
      recorderLeaseExpiresAt: leaseExpiresAt,
      recorderLeaseId: leaseId,
      updatedAt: now,
    })
    .where(
      and(
        eq(meeting.id, existing.id),
        or(
          isNull(meeting.recorderLeaseExpiresAt),
          lt(meeting.recorderLeaseExpiresAt, now),
        ),
      ),
    )
    .returning();

  if (!claimed) {
    throw new ServiceMutationError(
      "Another collaborator is already recording this meeting",
      409,
    );
  }

  return { leaseExpiresAt, leaseId, meeting: claimed };
}

export async function recordMeetingConsent(input: {
  meetingId: string;
  metadata?: Record<string, unknown>;
  mode: "confirmed" | "played";
  userId: string;
}) {
  const existing = await getMeetingForUser(
    input.meetingId,
    input.userId,
    "edit",
  );
  const [event] = await db
    .insert(meetingConsentEvent)
    .values({
      id: crypto.randomUUID(),
      meetingId: existing.id,
      message: existing.consentMessage,
      metadata: input.metadata,
      mode: input.mode,
      userId: input.userId,
    })
    .returning();
  return event;
}

export async function heartbeatMeetingRecorder(input: {
  leaseId: string;
  meetingId: string;
  userId: string;
}) {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + RECORDER_LEASE_MS);
  const [renewed] = await db
    .update(meeting)
    .set({ recorderLeaseExpiresAt: leaseExpiresAt, updatedAt: now })
    .where(
      and(
        eq(meeting.id, input.meetingId),
        eq(meeting.recorderId, input.userId),
        // A paused recorder may renew after expiry only while it still owns the
        // exact lease. A replacement recorder receives a new lease ID.
        eq(meeting.recorderLeaseId, input.leaseId),
        isNull(meeting.deletedAt),
      ),
    )
    .returning();

  if (!renewed) throw new ServiceMutationError("Recorder lease expired", 409);
  return { leaseExpiresAt, meeting: renewed };
}

export async function releaseMeetingRecorder(input: {
  env?: RuntimeEnv;
  leaseId: string;
  meetingId: string;
  userId: string;
}) {
  const runtime = input.env
    ? getRuntimePorts().meetings
    : undefined;
  if (runtime) {
    const existing = await getMeetingForUser(
      input.meetingId,
      input.userId,
      "edit",
    );
    await runRecorderRuntimeMutation(() =>
      runtime.release({
        leaseId: input.leaseId,
        meetingId: input.meetingId,
        userId: input.userId,
      }),
    );
    return {
      ...existing,
      recorderId: null,
      recorderLeaseExpiresAt: null,
      recorderLeaseId: null,
    };
  }
  const [released] = await db
    .update(meeting)
    .set({
      recorderId: null,
      recorderLeaseExpiresAt: null,
      recorderLeaseId: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(meeting.id, input.meetingId),
        eq(meeting.recorderId, input.userId),
        eq(meeting.recorderLeaseId, input.leaseId),
      ),
    )
    .returning();

  if (!released)
    throw new ServiceMutationError("Recorder lease not found", 409);
  return released;
}

export async function validateMeetingRecorderLease(input: {
  leaseId: string;
  meetingId: string;
  userId: string;
}) {
  const [record] = await db
    .select()
    .from(meeting)
    .where(
      and(
        eq(meeting.id, input.meetingId),
        eq(meeting.recorderId, input.userId),
        eq(meeting.recorderLeaseId, input.leaseId),
        gt(meeting.recorderLeaseExpiresAt, new Date()),
        isNull(meeting.deletedAt),
      ),
    )
    .limit(1);
  if (!record) throw new ServiceMutationError("Recorder lease expired", 409);
  return record;
}
