import { and, eq, isNull } from "drizzle-orm";

import { canAccessPageInWorkspace } from "../../access";
import { db } from "../../db";
import { meeting, page } from "../../db/schema";
import { ServiceMutationError } from "../../services/mutation-error";
import { clampMeetingDuration, getNextMeetingStatus } from "./meeting-state";
import type {
  MeetingLifecycleAction,
  MeetingPatch,
  MeetingStatus,
} from "./meeting-types";

export async function getMeetingForUser(
  meetingId: string,
  userId: string,
  required: "view" | "edit" = "view",
) {
  const [record] = await db
    .select()
    .from(meeting)
    .where(and(eq(meeting.id, meetingId), isNull(meeting.deletedAt)))
    .limit(1);

  if (!record) {
    throw new ServiceMutationError("Meeting not found", 404);
  }

  if (
    !(await canAccessPageInWorkspace(
      record.pageId,
      record.workspaceId,
      userId,
      required,
    ))
  ) {
    throw new ServiceMutationError("Forbidden", 403);
  }

  return record;
}

export async function createMeeting(input: {
  pageId: string;
  title?: string;
  userId: string;
  workspaceId: string;
}) {
  const [pageRecord] = await db
    .select({ id: page.id })
    .from(page)
    .where(
      and(
        eq(page.id, input.pageId),
        eq(page.workspaceId, input.workspaceId),
        isNull(page.deletedAt),
      ),
    )
    .limit(1);

  if (!pageRecord) {
    throw new ServiceMutationError("Page not found", 404);
  }

  if (
    !(await canAccessPageInWorkspace(
      pageRecord.id,
      input.workspaceId,
      input.userId,
      "edit",
    ))
  ) {
    throw new ServiceMutationError("Forbidden", 403);
  }

  const [created] = await db
    .insert(meeting)
    .values({
      createdById: input.userId,
      id: crypto.randomUUID(),
      pageId: input.pageId,
      title: input.title?.trim() || "Meeting",
      workspaceId: input.workspaceId,
    })
    .returning();

  return created;
}

export async function updateMeeting(input: {
  meetingId: string;
  patch: MeetingPatch;
  userId: string;
}) {
  const existing = await getMeetingForUser(input.meetingId, input.userId, "edit");
  const values: Partial<typeof meeting.$inferInsert> = { updatedAt: new Date() };

  if (input.patch.title !== undefined) {
    values.title = input.patch.title.trim() || "Meeting";
  }
  if (input.patch.language !== undefined) {
    values.language = input.patch.language;
  }
  if (input.patch.instructionsPreset !== undefined) {
    values.instructionsPreset = input.patch.instructionsPreset;
  }
  if (input.patch.customInstructions !== undefined) {
    values.customInstructions = input.patch.customInstructions;
  }
  if (input.patch.consentMessage !== undefined) {
    values.consentMessage = input.patch.consentMessage;
  }
  if (input.patch.autoPlayConsent !== undefined) {
    values.autoPlayConsent = input.patch.autoPlayConsent;
  }
  if (input.patch.archiveLocalAudio !== undefined) {
    values.archiveLocalAudio = input.patch.archiveLocalAudio;
  }

  const [updated] = await db
    .update(meeting)
    .set(values)
    .where(eq(meeting.id, existing.id))
    .returning();

  return updated;
}

export async function transitionMeeting(input: {
  action: MeetingLifecycleAction;
  durationMs?: number;
  meetingId: string;
  userId: string;
}) {
  const existing = await getMeetingForUser(input.meetingId, input.userId, "edit");
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

export async function deleteMeeting(input: {
  meetingId: string;
  userId: string;
}) {
  const existing = await getMeetingForUser(input.meetingId, input.userId, "edit");

  if (["recording", "paused", "processing"].includes(existing.status)) {
    throw new ServiceMutationError("Stop the meeting before deleting it", 409);
  }

  const now = new Date();
  const [deleted] = await db
    .update(meeting)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(meeting.id, existing.id))
    .returning();

  return deleted;
}
