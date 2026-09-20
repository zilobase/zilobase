import { and, desc, eq, isNull } from "drizzle-orm";
import { hasPageBodyContent } from "@zilobase/features/pages/content-state";
import {
  canAccessPageInWorkspace,
  getAccessiblePageIds,
  getMembership,
} from "../../access";

import type { RuntimeEnv } from "../../../shared/config/config";
import { db } from "../../../infrastructure/database";
import { meeting, page } from "../../../infrastructure/database/schema";
import { upsertPageItemPlacement } from "../../pages/placements";
import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";
import { getRuntimePorts } from "@zilobase/runtime-adapter/capabilities";
import { isMeetingRecordingActive } from "./meeting-state";
import type { MeetingPatch, MeetingStatus } from "../contracts/meeting-types";
import { getMeetingForUser } from "./meeting-access";

const EMPTY_NOTES_CONTENT = {
  content: [{ type: "paragraph" }],
  type: "doc",
};

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
      hasContent: hasPageBodyContent(EMPTY_NOTES_CONTENT),
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
  const existing = await getMeetingForUser(
    input.meetingId,
    input.userId,
    "edit",
  );
  const values: Partial<typeof meeting.$inferInsert> = {
    updatedAt: new Date(),
  };

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
      // automation-origin: system. Meeting notes remain meeting-owned pages;
      // attaching one to a database emits only the canonical row-added fact.
      await tx
        .update(page)
        .set({ name: values.title, updatedAt: values.updatedAt })
        .where(eq(page.id, existing.notesPageId));
    }

    return [meetingRecord];
  });

  return updated;
}

export async function deleteMeeting(input: {
  env?: RuntimeEnv;
  meetingId: string;
  userId: string;
}) {
  const existing = await getMeetingForUser(
    input.meetingId,
    input.userId,
    "edit",
  );

  if (input.env) {
    const runtimeState = await getRuntimePorts().meetings?.get(existing.id);
    if (
      runtimeState &&
      ["claimed", "recording", "paused", "finishing"].includes(
        runtimeState.status,
      )
    ) {
      throw new ServiceMutationError(
        "Stop the recording before deleting this meeting",
        409,
      );
    }
  }

  if (isMeetingRecordingActive(existing.status as MeetingStatus)) {
    throw new ServiceMutationError(
      "Stop the recording before deleting this meeting",
      409,
    );
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
