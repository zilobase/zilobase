import { Hono } from "hono";
import type { Context } from "hono";
import { Schema } from "effect";
import { getAuthenticatedUser as requireUser } from "../../shared/http/auth";
import { AiProviderConfigError } from "../ai/providers/ai-provider";
import { enqueueAiJob } from "../ai/jobs/ai-jobs";

import {
  getEffectivePageAccessInWorkspace,
  getWorkspaceRealtimeAccessExpiration,
  hasAccess,
} from "../access";
import { rejectMismatchedApiKeyWorkspace } from "../api-keys";
import {
  createCollaborationTicket,
  documentNameForMeeting,
} from "../collaboration/service";
import { getMeetingCollaborationWebSocketUrl } from "@zilobase/runtime-adapter/capabilities";
import { getMeetingAudioWebSocketUrl } from "@zilobase/runtime-adapter/capabilities";
import { ServiceMutationError } from "../../shared/errors/service-mutation-error";
import type { AppBindings } from "../../shared/types";
import { parseJsonBody } from "../../shared/http/schema-json";
import {
  claimMeetingRecorder,
  createMeeting,
  deleteMeeting,
  getMeetingForUser,
  listMeetingsForUser,
  recordMeetingConsent,
  releaseMeetingRecorder,
  transitionMeeting,
  updateMeeting,
} from "./lifecycle/meeting-service";
import { createMeetingAudioTicket } from "./audio/meeting-audio-ticket";
import { meetingLifecycleActions } from "./contracts/meeting-types";

const strictJson = { onExcessProperty: "error" as const };

const UuidString = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      { message: "Invalid UUID" },
    ),
  ),
);

const CreateMeetingInput = Schema.Struct({
  pageId: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  title: Schema.optionalKey(Schema.String.pipe(Schema.check(Schema.isMaxLength(200)))),
  workspaceId: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
});

const UpdateMeetingInput = Schema.Struct({
  archiveLocalAudio: Schema.optionalKey(Schema.Boolean),
  autoPlayConsent: Schema.optionalKey(Schema.Boolean),
  consentMessage: Schema.optionalKey(
    Schema.String.pipe(Schema.check(Schema.isMaxLength(2_000))),
  ),
  customInstructions: Schema.optionalKey(
    Schema.NullOr(
      Schema.String.pipe(Schema.check(Schema.isMaxLength(8_000))),
    ),
  ),
  instructionsPreset: Schema.optionalKey(
    Schema.String.pipe(
      Schema.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
    ),
  ),
  language: Schema.optionalKey(
    Schema.String.pipe(
      Schema.check(Schema.isMinLength(2), Schema.isMaxLength(35)),
    ),
  ),
  title: Schema.optionalKey(
    Schema.String.pipe(Schema.check(Schema.isMaxLength(200))),
  ),
});

const LifecycleInput = Schema.Struct({
  durationMs: Schema.optionalKey(
    Schema.Number.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
  ),
  leaseId: Schema.optionalKey(UuidString),
});

const RecorderLeaseInput = Schema.Struct({
  leaseId: UuidString,
});

const ConsentInput = Schema.Struct({
  metadata: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.Unknown),
  ),
  mode: Schema.Literals(["confirmed", "played"]),
});

export const meetingRoutes = new Hono<AppBindings>();

meetingRoutes.use("*", async (c, next) => {
  if (c.env.MEETING_BLOCK_ENABLED !== "true") {
    return c.json({ error: "Meeting blocks are not enabled" }, 404);
  }

  await next();
});

function serviceError(c: Context<AppBindings>, error: unknown) {
  if (error instanceof AiProviderConfigError) {
    return c.json({ error: error.message }, error.status === 503 ? 503 : 400);
  }
  if (!(error instanceof ServiceMutationError)) {
    throw error;
  }

  return c.json(
    { error: error.message },
    error.status === 403
      ? 403
      : error.status === 404
        ? 404
        : error.status === 409
          ? 409
          : 400,
  );
}

meetingRoutes.get("/", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const workspaceId = c.req.query("workspaceId");
  if (!workspaceId) {
    return c.json({ error: "workspaceId is required" }, 400);
  }

  const mismatch = rejectMismatchedApiKeyWorkspace(c, workspaceId);
  if (mismatch) return mismatch;

  try {
    return c.json({
      meetings: await listMeetingsForUser({
        userId: user.id,
        workspaceId,
      }),
    });
  } catch (error) {
    return serviceError(c, error);
  }
});

meetingRoutes.post("/", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const parsed = await parseJsonBody(c.req, CreateMeetingInput);
  if (!parsed.ok) {
    return c.json({ error: "Invalid meeting payload" }, 400);
  }

  const mismatch = rejectMismatchedApiKeyWorkspace(c, parsed.data.workspaceId);
  if (mismatch) return mismatch;

  try {
    return c.json(
      { meeting: await createMeeting({ ...parsed.data, userId: user.id }) },
      201,
    );
  } catch (error) {
    return serviceError(c, error);
  }
});

meetingRoutes.get("/:id", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    return c.json({ meeting: await getMeetingForUser(c.req.param("id"), user.id) });
  } catch (error) {
    return serviceError(c, error);
  }
});

meetingRoutes.post("/:id/collaboration-ticket", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const existing = await getMeetingForUser(c.req.param("id"), user.id);
    const accessLevel = await getEffectivePageAccessInWorkspace(
      existing.pageId,
      existing.workspaceId,
      user.id,
    );
    const documentName = documentNameForMeeting(existing.id);
    const ticket = await createCollaborationTicket(
      {
        meetingId: existing.id,
        scope: hasAccess(accessLevel, "edit") ? "read-write" : "readonly",
        userId: user.id,
        workspaceId: existing.workspaceId,
      },
      c.env,
      {
        maxExpiresAt: await getWorkspaceRealtimeAccessExpiration(
          existing.workspaceId,
          user.id,
        ),
      },
    );
    const websocketUrl = new URL(
      getMeetingCollaborationWebSocketUrl(c.req.raw),
    );
    websocketUrl.searchParams.set("document", documentName);

    return c.json({
      documentName,
      websocketUrl: websocketUrl.toString(),
      ...ticket,
    });
  } catch (error) {
    return serviceError(c, error);
  }
});

meetingRoutes.post("/:id/recorder/claim", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    const lease = await claimMeetingRecorder({
      env: c.env,
      meetingId: c.req.param("id"),
      recorderImage: user.image,
      recorderName: user.name,
      userId: user.id,
    });
    const ticket = await createMeetingAudioTicket(
      {
        leaseId: lease.leaseId,
        meetingId: lease.meeting.id,
        recorderImage: user.image,
        recorderName: user.name,
        userId: user.id,
        workspaceId: lease.meeting.workspaceId,
      },
      c.env,
    );
    const websocketUrl = new URL(getMeetingAudioWebSocketUrl(c.req.raw));
    websocketUrl.searchParams.set("meeting", lease.meeting.id);

    return c.json({
      expiresAt: ticket.expiresAt,
      leaseExpiresAt: lease.leaseExpiresAt.toISOString(),
      leaseId: lease.leaseId,
      meeting: lease.meeting,
      token: ticket.token,
      websocketUrl: websocketUrl.toString(),
    });
  } catch (error) {
    return serviceError(c, error);
  }
});

meetingRoutes.post("/:id/consent", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const parsed = await parseJsonBody(c.req, ConsentInput);
  if (!parsed.ok) return c.json({ error: "Invalid consent event" }, 400);
  try {
    return c.json({
      consent: await recordMeetingConsent({
        ...parsed.data,
        meetingId: c.req.param("id"),
        userId: user.id,
      }),
    }, 201);
  } catch (error) {
    return serviceError(c, error);
  }
});

meetingRoutes.post("/:id/recorder/release", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const parsed = await parseJsonBody(c.req, RecorderLeaseInput);
  if (!parsed.ok) return c.json({ error: "Invalid recorder lease" }, 400);

  try {
    return c.json({
      meeting: await releaseMeetingRecorder({
        env: c.env,
        leaseId: parsed.data.leaseId,
        meetingId: c.req.param("id"),
        userId: user.id,
      }),
    });
  } catch (error) {
    return serviceError(c, error);
  }
});

meetingRoutes.post("/:id/summary", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  try {
    const record = await getMeetingForUser(c.req.param("id"), user.id, "edit");
    const job = await enqueueAiJob({
      dedupeKey: `${record.id}:${record.transcriptRevision}:${record.updatedAt.toISOString()}`,
      env: c.env,
      input: { meetingId: record.id },
      type: "meeting-summary",
      userId: user.id,
      workspaceId: record.workspaceId,
    });
    return c.json({
      job: {
        error: job.status === "failed" ? job.error : null,
        id: job.id,
        progress: job.progress,
        status: job.status,
        type: job.type,
      },
      meeting: record,
    }, 202);
  } catch (error) {
    return serviceError(c, error);
  }
});

meetingRoutes.patch("/:id", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const parsed = await parseJsonBody(c.req, UpdateMeetingInput, strictJson);
  if (!parsed.ok) {
    return c.json({ error: "Invalid meeting patch" }, 400);
  }

  try {
    return c.json({
      meeting: await updateMeeting({
        meetingId: c.req.param("id"),
        patch: parsed.data,
        userId: user.id,
      }),
    });
  } catch (error) {
    return serviceError(c, error);
  }
});

for (const action of meetingLifecycleActions) {
  meetingRoutes.post(`/:id/${action}`, async (c) => {
    const user = requireUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const parsed = await parseJsonBody(c.req, LifecycleInput);
    if (!parsed.ok) {
      return c.json({ error: "Invalid lifecycle payload" }, 400);
    }

    try {
      return c.json({
        meeting: await transitionMeeting({
          action,
          durationMs: parsed.data.durationMs,
          env: c.env,
          leaseId: parsed.data.leaseId,
          meetingId: c.req.param("id"),
          userId: user.id,
        }),
      });
    } catch (error) {
      return serviceError(c, error);
    }
  });
}

meetingRoutes.delete("/:id", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  try {
    return c.json({
      meeting: await deleteMeeting({
        env: c.env,
        meetingId: c.req.param("id"),
        userId: user.id,
      }),
    });
  } catch (error) {
    return serviceError(c, error);
  }
});
