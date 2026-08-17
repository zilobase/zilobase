import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";

import { rejectMismatchedApiKeyWorkspace } from "../../api-keys";
import { ServiceMutationError } from "../../services/mutation-error";
import type { AppBindings } from "../../types";
import {
  createMeeting,
  deleteMeeting,
  getMeetingForUser,
  transitionMeeting,
  updateMeeting,
} from "./meeting-service";
import { meetingLifecycleActions } from "./meeting-types";

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
        meetingId: c.req.param("id"),
        userId: user.id,
      }),
    });
  } catch (error) {
    return serviceError(c, error);
  }
});
