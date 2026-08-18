import { and, asc, desc, eq, gt, isNull, lt, or } from "drizzle-orm";

import {
  canAccessPageInWorkspace,
  getAccessiblePageIds,
  getMembership,
} from "../../access";
import { encodePageContentAsYjs } from "../../collaboration/service";
import { db } from "../../db";
import {
  meeting,
  meetingConsentEvent,
  meetingTranscriptSegment,
  page,
  pageCollaborationDocument,
} from "../../db/schema";
import { upsertPageItemPlacement } from "../../page-item-placements";
import { ServiceMutationError } from "../../services/mutation-error";
import { clampMeetingDuration, getNextMeetingStatus } from "./meeting-state";
import type {
  MeetingLifecycleAction,
  MeetingPatch,
  MeetingStatus,
} from "./meeting-types";

const EMPTY_NOTES_CONTENT = {
  content: [{ type: "paragraph" }],
  type: "doc",
};

const RECORDER_LEASE_MS = 30_000;

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

  return ensureMeetingNotesPage(record, userId);
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

  const title = input.title?.trim() || "Meeting";
  const notesPageId = crypto.randomUUID();
  const now = new Date();

  const [created] = await db.transaction(async (tx) => {
    await tx.insert(page).values({
      content: EMPTY_NOTES_CONTENT,
      createdById: input.userId,
      id: notesPageId,
      metadata: { emoji: "📅" },
      name: title,
      type: "meeting",
      url: "#",
      workspaceId: input.workspaceId,
    });
    await tx.insert(pageCollaborationDocument).values({
      pageId: notesPageId,
      state: Buffer.from(encodePageContentAsYjs(EMPTY_NOTES_CONTENT)),
      updatedAt: now,
    });
    await upsertPageItemPlacement(tx, {
      itemId: notesPageId,
      itemKind: "page",
      parentId: input.pageId,
      parentKind: "page",
      placementKind: "primary",
      workspaceId: input.workspaceId,
    });
    return tx
      .insert(meeting)
      .values({
        createdById: input.userId,
        id: crypto.randomUUID(),
        notesPageId,
        pageId: input.pageId,
        title,
        workspaceId: input.workspaceId,
      })
      .returning();
  });

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

  const [updated] = await db.transaction(async (tx) => {
    const [meetingRecord] = await tx
      .update(meeting)
      .set(values)
      .where(eq(meeting.id, existing.id))
      .returning();

    if (values.title !== undefined && existing.notesPageId) {
      await tx
        .update(page)
        .set({ name: values.title, updatedAt: values.updatedAt })
        .where(eq(page.id, existing.notesPageId));
    }

    return [meetingRecord];
  });

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
  const [deleted] = await db.transaction(async (tx) => {
    const [meetingRecord] = await tx
      .update(meeting)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(meeting.id, existing.id))
      .returning();

    if (existing.notesPageId) {
      await tx
        .update(page)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(page.id, existing.notesPageId));
    }

    return [meetingRecord];
  });

  return deleted;
}

export async function listMeetingsForUser(input: {
  userId: string;
  workspaceId: string;
}) {
  if (!(await getMembership(input.workspaceId, input.userId))) {
    throw new ServiceMutationError("Forbidden", 403);
  }

  const accessibleIds = await getAccessiblePageIds(
    input.workspaceId,
    input.userId,
    { membershipVerified: true },
  );
  const rows = await db
    .select({
      meeting,
      notesMetadata: page.metadata,
    })
    .from(meeting)
    .leftJoin(page, eq(page.id, meeting.notesPageId))
    .where(
      and(
        eq(meeting.workspaceId, input.workspaceId),
        isNull(meeting.deletedAt),
      ),
    )
    .orderBy(desc(meeting.updatedAt));

  return rows
    .filter((row) => accessibleIds.has(row.meeting.pageId))
    .map((row) => ({
      ...row.meeting,
      emoji: readPageEmoji(row.notesMetadata),
    }));
}

async function ensureMeetingNotesPage(
  record: typeof meeting.$inferSelect,
  userId: string,
) {
  if (record.notesPageId) {
    return record;
  }

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(meeting)
      .where(and(eq(meeting.id, record.id), isNull(meeting.deletedAt)))
      .for("update")
      .limit(1);

    if (!current) {
      throw new ServiceMutationError("Meeting not found", 404);
    }
    if (current.notesPageId) {
      return current;
    }

    const notesPageId = crypto.randomUUID();
    const now = new Date();
    await tx.insert(page).values({
      content: EMPTY_NOTES_CONTENT,
      createdById: current.createdById ?? userId,
      id: notesPageId,
      metadata: { emoji: "📅" },
      name: current.title,
      type: "meeting",
      url: "#",
      workspaceId: current.workspaceId,
    });
    await tx.insert(pageCollaborationDocument).values({
      pageId: notesPageId,
      state: Buffer.from(encodePageContentAsYjs(EMPTY_NOTES_CONTENT)),
      updatedAt: now,
    });
    await upsertPageItemPlacement(tx, {
      itemId: notesPageId,
      itemKind: "page",
      parentId: current.pageId,
      parentKind: "page",
      placementKind: "primary",
      workspaceId: current.workspaceId,
    });
    const [updated] = await tx
      .update(meeting)
      .set({ notesPageId, updatedAt: now })
      .where(eq(meeting.id, current.id))
      .returning();

    return updated;
  });
}

function readPageEmoji(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const emoji = (metadata as { emoji?: unknown }).emoji;
  return typeof emoji === "string" && emoji.length > 0 ? emoji : null;
}

export async function claimMeetingRecorder(input: {
  meetingId: string;
  userId: string;
}) {
  const existing = await getMeetingForUser(input.meetingId, input.userId, "edit");
  const now = new Date();
  const [consent] = await db
    .select({ acknowledgedAt: meetingConsentEvent.acknowledgedAt })
    .from(meetingConsentEvent)
    .where(
      and(
        eq(meetingConsentEvent.meetingId, existing.id),
        eq(meetingConsentEvent.userId, input.userId),
        gt(meetingConsentEvent.acknowledgedAt, new Date(now.getTime() - 10 * 60 * 1_000)),
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
  const existing = await getMeetingForUser(input.meetingId, input.userId, "edit");
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
        eq(meeting.recorderLeaseId, input.leaseId),
        gt(meeting.recorderLeaseExpiresAt, now),
        isNull(meeting.deletedAt),
      ),
    )
    .returning();

  if (!renewed) throw new ServiceMutationError("Recorder lease expired", 409);
  return { leaseExpiresAt, meeting: renewed };
}

export async function releaseMeetingRecorder(input: {
  leaseId: string;
  meetingId: string;
  userId: string;
}) {
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

  if (!released) throw new ServiceMutationError("Recorder lease not found", 409);
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

export async function appendMeetingTranscriptSegment(input: {
  endMs: number;
  meetingId: string;
  providerItemId: string;
  sequence: number;
  startMs: number;
  text: string;
}) {
  const [record] = await db
    .select({ revision: meeting.transcriptRevision })
    .from(meeting)
    .where(and(eq(meeting.id, input.meetingId), isNull(meeting.deletedAt)))
    .limit(1);
  if (!record) throw new ServiceMutationError("Meeting not found", 404);

  const [inserted] = await db
    .insert(meetingTranscriptSegment)
    .values({
      endMs: input.endMs,
      id: crypto.randomUUID(),
      meetingId: input.meetingId,
      providerItemId: input.providerItemId,
      revision: record.revision,
      sequence: input.sequence,
      startMs: input.startMs,
      text: input.text.trim(),
    })
    .onConflictDoNothing()
    .returning();

  if (inserted) return inserted;
  const [existing] = await db
    .select()
    .from(meetingTranscriptSegment)
    .where(
      and(
        eq(meetingTranscriptSegment.meetingId, input.meetingId),
        eq(meetingTranscriptSegment.providerItemId, input.providerItemId),
      ),
    )
    .limit(1);
  return existing ?? null;
}

export async function listMeetingTranscript(input: {
  meetingId: string;
  userId: string;
}) {
  const existing = await getMeetingForUser(input.meetingId, input.userId);
  return db
    .select()
    .from(meetingTranscriptSegment)
    .where(
      and(
        eq(meetingTranscriptSegment.meetingId, existing.id),
        eq(meetingTranscriptSegment.revision, existing.transcriptRevision),
      ),
    )
    .orderBy(asc(meetingTranscriptSegment.sequence));
}
