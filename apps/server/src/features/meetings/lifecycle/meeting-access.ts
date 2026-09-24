import { and, eq, isNull } from "drizzle-orm";

import { canAccessPageInWorkspace } from "../../access";

import { db } from "../../../infrastructure/database";
import { meeting } from "../../../infrastructure/database/schema";

import { ServiceMutationError } from "../../../shared/errors/service-mutation-error";

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

  if (!(await canAccessPageInWorkspace(record.pageId, record.workspaceId, userId, required))) {
    throw new ServiceMutationError("Forbidden", 403);
  }

  return record;
}
