import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { AiProviderConfigError } from "../../ai/ai-provider";

import { getEffectivePageAccessInWorkspace, hasAccess } from "../../access";
import { rejectMismatchedApiKeyWorkspace } from "../../api-keys";
import {
  createCollaborationTicket,
  documentNameForMeeting,
} from "../../collaboration/service";
import { getMeetingCollaborationWebSocketUrl } from "../../runtime-adapter";
import { getMeetingAudioWebSocketUrl } from "../../runtime-adapter";
import { ServiceMutationError } from "../../services/mutation-error";
import type { AppBindings } from "../../types";
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
} from "./meeting-service";
import { createMeetingAudioTicket } from "./meeting-audio-ticket";
import { meetingLifecycleActions } from "./meeting-types";
import { generateMeetingSummary } from "./meeting-summary-service";

const createMeetingSchema = z.object({
  pageId: z.string().min(1),
  title: z.string().max(200).optional(),
  workspaceId: z.string().min(1),
});

const updateMeetingSchema = z
  .object({
    archiveLocalAudio: z.boolean().optional(),
    autoPlayConsent: z.boolean().optional(),
    consentMessage: z.string().max(2_000).optional(),
    customInstructions: z.string().max(8_000).nullable().optional(),
    instructionsPreset: z.string().min(1).max(80).optional(),
    language: z.string().min(2).max(35).optional(),
    title: z.string().max(200).optional(),
  })
  .strict();

const lifecycleSchema = z.object({
  durationMs: z.number().nonnegative().optional(),
  leaseId: z.string().uuid().optional(),
});

const recorderLeaseSchema = z.object({
  leaseId: z.string().uuid(),
});

const consentSchema = z.object({
  metadata: z.record(z.string(), z.unknown()).optional(),
  mode: z.enum(["confirmed", "played"]),
});

export const meetingRoutes = new Hono<AppBindings>();

meetingRoutes.use("*", async (c, next) => {
  if (c.env.MEETING_BLOCK_ENABLED !== "true") {
    return c.json({ error: "Meeting blocks are not enabled" }, 404);
  }

  await next();
});

const requireUser = (c: Context<AppBindings>) => c.get("user") ?? null;

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

  const parsed = createMeetingSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Invalid meeting payload", issues: parsed.error.issues }, 400);
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
    );
    const websocketUrl = new URL(
      getMeetingCollaborationWebSocketUrl(c.req.raw, c.env),
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
    const websocketUrl = new URL(getMeetingAudioWebSocketUrl(c.req.raw, c.env));
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
  const parsed = consentSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid consent event" }, 400);
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
  const parsed = recorderLeaseSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid recorder lease" }, 400);

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
    return c.json(await generateMeetingSummary({
      env: c.env,
      meetingId: c.req.param("id"),
      userId: user.id,
    }));
  } catch (error) {
    return serviceError(c, error);
  }
});

meetingRoutes.patch("/:id", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const parsed = updateMeetingSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "Invalid meeting patch", issues: parsed.error.issues }, 400);
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

    const parsed = lifecycleSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Invalid lifecycle payload", issues: parsed.error.issues }, 400);
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
