import { eq } from "drizzle-orm";

import type { RuntimeEnv } from "../../../shared/config/config";
import { db } from "../../../infrastructure/database";
import { meeting } from "../../../infrastructure/database/schema";

import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";
import { getRuntimePorts } from "@zilobase/runtime-adapter/capabilities";
import { clampMeetingDuration, getNextMeetingStatus } from "./meeting-state";
import type {
  MeetingLifecycleAction,
  MeetingStatus,
} from "../contracts/meeting-types";
import { getMeetingForUser } from "./meeting-access";
import { runRecorderRuntimeMutation } from "./recorder-runtime";

export async function transitionMeeting(input: {
  action: MeetingLifecycleAction;
  durationMs?: number;
  env?: RuntimeEnv;
  leaseId?: string;
  meetingId: string;
  userId: string;
}) {
  const existing = await getMeetingForUser(
    input.meetingId,
    input.userId,
    "edit",
  );

  // The audio WebSocket owns the durable stop/flush. A lifecycle request can
  // race just behind that transaction, so stopping an archived meeting is safe.
  if (
    input.action === "stop" &&
    ["processing", "completed"].includes(existing.status)
  ) {
    return existing;
  }

  const runtime = input.env
    ? getRuntimePorts().meetings
    : undefined;
  if (runtime && input.action === "start") {
    try {
      getNextMeetingStatus(existing.status as MeetingStatus, input.action);
    } catch (error) {
      throw new ServiceMutationError((error as Error).message, 409);
    }
  }
  if (
    runtime &&
    (input.action === "start" ||
      input.action === "pause" ||
      input.action === "resume")
  ) {
    if (!input.leaseId) {
      throw new ServiceMutationError(
        "Only the collaborator who started recording can control it",
        409,
      );
    }
    const action = input.action;
    const state = await runRecorderRuntimeMutation(() =>
      runtime.transition({
        action,
        durationMs: input.durationMs,
        leaseId: input.leaseId,
        meetingId: existing.id,
        userId: input.userId,
      }),
    );
    return {
      ...existing,
      recorderId: state.recorderId,
      recorderLeaseExpiresAt: new Date(state.expiresAt),
      recorderLeaseId: state.leaseId,
      status:
        state.status === "claimed" || state.status === "finishing"
          ? existing.status
          : state.status,
    };
  }

  if (
    ["start", "pause", "resume", "stop"].includes(input.action) &&
    (!input.leaseId ||
      existing.recorderId !== input.userId ||
      existing.recorderLeaseId !== input.leaseId)
  ) {
    throw new ServiceMutationError(
      "Only the collaborator who started recording can control it",
      409,
    );
  }
  let next: MeetingStatus;

  try {
    next = getNextMeetingStatus(existing.status as MeetingStatus, input.action);
  } catch (error) {
    throw new ServiceMutationError((error as Error).message, 409);
  }

  const now = new Date();
  const values: Partial<typeof meeting.$inferInsert> = {
    status: next,
    updatedAt: now,
  };

  if (input.action === "start") {
    values.durationMs = 0;
    values.recordingStartedAt = now;
    values.recordingStoppedAt = null;
  } else if (input.action === "stop") {
    values.durationMs = clampMeetingDuration(
      input.durationMs ??
        (existing.recordingStartedAt
          ? now.getTime() - existing.recordingStartedAt.getTime()
          : existing.durationMs),
    );
    values.recordingStoppedAt = now;
  }

  const [updated] = await db
    .update(meeting)
    .set(values)
    .where(eq(meeting.id, existing.id))
    .returning();

  return updated;
}
