import { and, desc, eq, gt, inArray, isNull, lt, ne, or } from "drizzle-orm";

import {
  canAccessPageInWorkspace,
  getAccessiblePageIds,
  getMembership,
} from "../../access";
import {
  appendMeetingTranscript,
} from "../../collaboration/service";
import type { RuntimeEnv } from "../../config";
import { db } from "../../db";
import {
  meeting,
  meetingCollaborationDocument,
  meetingConsentEvent,
  meetingTranscriptSegment,
  page,
} from "../../db/schema";
import { upsertPageItemPlacement } from "../../page-item-placements";
import { ServiceMutationError } from "../../services/mutation-error";
import { getRuntimeAdapter } from "../../runtime-adapter";
import {
  clampMeetingDuration,
  getNextMeetingStatus,
  isMeetingRecordingActive,
} from "./meeting-state";
import type {
  MeetingLifecycleAction,
  MeetingPatch,
  MeetingStatus,
} from "./meeting-types";

const EMPTY_NOTES_CONTENT = {
  content: [{ type: "paragraph" }],
  type: "doc",
};

const RECORDER_LEASE_MS = 90_000;
export const MEETING_RECORDER_LEASE_HEARTBEAT_MS = 60_000;

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

  const title = input.title?.trim() || "Meeting";
  const notesPageId = crypto.randomUUID();

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
  env?: RuntimeEnv;
  leaseId?: string;
  meetingId: string;
  userId: string;
}) {
  const existing = await getMeetingForUser(input.meetingId, input.userId, "edit");

  // The audio WebSocket owns the durable stop/flush. A lifecycle request can
  // race just behind that transaction, so stopping an archived meeting is safe.
  if (
    input.action === "stop" &&
    ["processing", "completed"].includes(existing.status)
  ) {
    return existing;
  }

  const runtime = input.env
    ? getRuntimeAdapter().transitionMeetingRecorderSession
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
    (
      input.action === "start" ||
      input.action === "pause" ||
      input.action === "resume"
    )
  ) {
    if (!input.leaseId) {
      throw new ServiceMutationError(
        "Only the collaborator who started recording can control it",
        409,
      );
    }
    const action = input.action;
    const state = await runRecorderRuntimeMutation(() => runtime({
      action,
      durationMs: input.durationMs,
      env: input.env!,
      leaseId: input.leaseId,
      meetingId: existing.id,
      userId: input.userId,
    }));
    return {
      ...existing,
      recorderId: state.recorderId,
      recorderLeaseExpiresAt: new Date(state.expiresAt),
      recorderLeaseId: state.leaseId,
      status: state.status === "claimed" || state.status === "finishing"
        ? existing.status
        : state.status,
    };
  }

  if (
    ["start", "pause", "resume", "stop"].includes(input.action) &&
    (
      !input.leaseId ||
      existing.recorderId !== input.userId ||
      existing.recorderLeaseId !== input.leaseId
    )
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

export async function deleteMeeting(input: {
  env?: RuntimeEnv;
  meetingId: string;
  userId: string;
}) {
  const existing = await getMeetingForUser(input.meetingId, input.userId, "edit");

  if (input.env) {
    const runtimeState = await getRuntimeAdapter().getMeetingRecorderSession?.({
      env: input.env,
      meetingId: existing.id,
    });
    if (runtimeState && ["claimed", "recording", "paused", "finishing"].includes(runtimeState.status)) {
      throw new ServiceMutationError("Stop the recording before deleting this meeting", 409);
    }
  }

  if (isMeetingRecordingActive(existing.status as MeetingStatus)) {
    throw new ServiceMutationError("Stop the recording before deleting this meeting", 409);
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

function readPageEmoji(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const emoji = (metadata as { emoji?: unknown }).emoji;
  return typeof emoji === "string" && emoji.length > 0 ? emoji : null;
}

export async function claimMeetingRecorder(input: {
  env?: RuntimeEnv;
  meetingId: string;
  recorderImage?: string | null;
  recorderName?: string;
  userId: string;
}) {
  const existing = await getMeetingForUser(input.meetingId, input.userId, "edit");
  const now = new Date();
  const runtime = input.env
    ? getRuntimeAdapter().claimMeetingRecorderSession
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
        durationMs: clampMeetingDuration(existing.recordingStartedAt
          ? now.getTime() - existing.recordingStartedAt.getTime()
          : existing.durationMs),
        recorderId: null,
        recorderLeaseExpiresAt: null,
        recorderLeaseId: null,
        recordingStoppedAt: now,
        status: "processing",
        updatedAt: now,
      })
      .where(and(
        eq(meeting.id, existing.id),
        inArray(meeting.status, ["recording", "paused"]),
        or(
          isNull(meeting.recorderLeaseExpiresAt),
          lt(meeting.recorderLeaseExpiresAt, now),
        ),
      ))
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
  if (runtime) {
    const claimed = await runRecorderRuntimeMutation(() => runtime({
      env: input.env!,
      meetingId: existing.id,
      recorderImage: input.recorderImage,
      recorderName: input.recorderName,
      userId: input.userId,
      workspaceId: existing.workspaceId,
    }));
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
    ? getRuntimeAdapter().releaseMeetingRecorderSession
    : undefined;
  if (runtime) {
    const existing = await getMeetingForUser(input.meetingId, input.userId, "edit");
    await runRecorderRuntimeMutation(() => runtime({
      env: input.env!,
      leaseId: input.leaseId,
      meetingId: input.meetingId,
      userId: input.userId,
    }));
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
  draftItemId?: string;
  endMs: number;
  env: RuntimeEnv;
  meetingId: string;
  providerItemId: string;
  sequence: number;
  source: "microphone" | "system";
  startMs: number;
  text: string;
  userId: string;
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
      source: input.source,
      startMs: input.startMs,
      text: input.text.trim(),
    })
    .onConflictDoNothing()
    .returning();

  const segment = inserted ?? (await db
    .select()
    .from(meetingTranscriptSegment)
    .where(
      and(
        eq(meetingTranscriptSegment.meetingId, input.meetingId),
        eq(meetingTranscriptSegment.providerItemId, input.providerItemId),
      ),
    )
    .limit(1))[0];

  if (!segment) return null;
  await appendMeetingTranscript({
    draftItemId: input.draftItemId,
    env: input.env,
    meetingId: input.meetingId,
    segment: {
      id: segment.id,
      source: input.source,
      startMs: segment.startMs,
      text: segment.text,
    },
    userId: input.userId,
  });
  return segment;
}

export type MeetingTranscriptSessionSegment = {
  endMs: number;
  id: string;
  providerItemId: string;
  sequence: number;
  source: "microphone" | "system";
  startMs: number;
  text: string;
};

/**
 * Persists one completed realtime recording session as a single transaction.
 * The meeting room keeps these rows and the generated Yjs changes in memory
 * while recording, then calls this once when its recorder socket closes.
 */
export async function persistMeetingTranscriptSession(input: {
  finalize?: {
    durationMs: number;
    startedAt: number;
    stoppedAt: number;
  };
  meetingId: string;
  segments: MeetingTranscriptSessionSegment[];
  yjsState: Uint8Array;
}) {
  return db.transaction(async (tx) => {
    const [record] = await tx
      .select({
        revision: meeting.transcriptRevision,
        status: meeting.status,
      })
      .from(meeting)
      .where(and(eq(meeting.id, input.meetingId), isNull(meeting.deletedAt)))
      .limit(1);

    if (!record) throw new ServiceMutationError("Meeting not found", 404);

    if (input.segments.length > 0) {
      await tx
        .insert(meetingTranscriptSegment)
        .values(input.segments.map((segment) => ({
          ...segment,
          meetingId: input.meetingId,
          revision: record.revision,
          text: segment.text.trim(),
        })))
        .onConflictDoNothing();
    }

    await tx
      .insert(meetingCollaborationDocument)
      .values({
        meetingId: input.meetingId,
        state: Buffer.from(input.yjsState),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: meetingCollaborationDocument.meetingId,
        set: {
          state: Buffer.from(input.yjsState),
          updatedAt: new Date(),
        },
      });

    if (input.finalize) {
      await tx
        .update(meeting)
        .set({
          durationMs: clampMeetingDuration(input.finalize.durationMs),
          recorderId: null,
          recorderLeaseExpiresAt: null,
          recorderLeaseId: null,
          recordingStartedAt: new Date(input.finalize.startedAt),
          recordingStoppedAt: new Date(input.finalize.stoppedAt),
          status: "processing",
          updatedAt: new Date(),
        })
        .where(and(
          eq(meeting.id, input.meetingId),
          isNull(meeting.deletedAt),
          ne(meeting.status, "completed"),
        ));
    }

    return { revision: record.revision, segmentCount: input.segments.length };
  });
}

async function runRecorderRuntimeMutation<T>(run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      /another collaborator|recorder lease|active recording|previous recording|cannot (?:pause|resume|start|stop)/i
        .test(message)
    ) {
      throw new ServiceMutationError(message, 409);
    }
    throw error;
  }
}
