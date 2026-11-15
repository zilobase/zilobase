import { z } from "zod";
import { ServiceMutationError } from "../../shared/errors/service-mutation-error";
import { parseOperationBody } from "../../shared/validation";
import { hasAccess } from "../access/access-level";
import { getEffectivePageAccessInWorkspace } from "../access/effective-access";
import { getWorkspaceRealtimeAccessExpiration } from "../access/principal-access";
import { documentNameForMeeting } from "../collaboration/documents/documents";
import { createCollaborationTicket } from "../collaboration/tickets/ticket-security";
import {
  requireOperationActor,
  requireOperationPolicy,
  requireOperationWorkspace,
  ServerOperationError,
  type ServerOperationContext,
} from "../operations/context";
import { createMeetingAudioTicket } from "./audio/meeting-audio-ticket";
import { meetingLifecycleActions } from "./contracts/meeting-types";
import { getMeetingForUser } from "./lifecycle/meeting-access";
import {
  createMeeting,
  deleteMeeting,
  listMeetingsForUser,
  updateMeeting,
} from "./lifecycle/meeting-operations";
import { transitionMeeting } from "./lifecycle/meeting-transitions";
import {
  claimMeetingRecorder,
  recordMeetingConsent,
  releaseMeetingRecorder,
} from "./lifecycle/recorder-session";
const UuidString = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    "Invalid UUID",
  );
const CreateMeetingInput = z.object({
  pageId: z.string().min(1),
  title: z.string().max(200).optional(),
  workspaceId: z.string().min(1),
});
const UpdateMeetingInput = z.strictObject({
  archiveLocalAudio: z.boolean().optional(),
  autoPlayConsent: z.boolean().optional(),
  consentMessage: z.string().max(2_000).optional(),
  customInstructions: z.string().max(8_000).nullable().optional(),
  instructionsPreset: z.string().min(1).max(80).optional(),
  language: z.string().min(2).max(35).optional(),
  title: z.string().max(200).optional(),
});
const LifecycleInput = z.object({
  durationMs: z.number().min(0).optional(),
  leaseId: UuidString.optional(),
});
const RecorderLeaseInput = z.object({
  leaseId: UuidString,
});
const ConsentInput = z.object({
  metadata: z.record(z.string(), z.unknown()).optional(),
  mode: z.enum(["confirmed", "played"]),
});
function serviceError(error: unknown): never {
  if (!(error instanceof ServiceMutationError)) {
    throw error;
  }
  return deny(
    { error: error.message },
    error.status === 403 ? 403 : error.status === 404 ? 404 : error.status === 409 ? 409 : 400,
  );
}

export type ListMeetingsOperationInput = { workspaceId?: string };
export async function listMeetingsOperation(
  context: ServerOperationContext,
  operationInput: ListMeetingsOperationInput,
) {
  requireMeetingPolicy(context, false);

  const user = requireOperationActor(context);
  const workspaceId = operationInput.workspaceId;
  if (!workspaceId) {
    return deny({ error: "workspaceId is required" }, 400);
  }
  requireOperationWorkspace(context, workspaceId);

  try {
    return {
      meetings: await listMeetingsForUser({
        userId: user.id,
        workspaceId,
      }),
    };
  } catch (error) {
    return serviceError(error);
  }
}

export type CreateMeetingOperationInput = { body?: unknown };
export async function createMeetingOperation(
  context: ServerOperationContext,
  operationInput: CreateMeetingOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireMeetingPolicy(context, true);

  const user = requireOperationActor(context);
  const parsed = await parseOperationBody(CreateMeetingInput, readBody);
  if (!parsed.ok) {
    return deny({ error: "Invalid meeting payload" }, 400);
  }
  requireOperationWorkspace(context, parsed.data.workspaceId);

  try {
    return { meeting: await createMeeting({ ...parsed.data, userId: user.id }) };
  } catch (error) {
    return serviceError(error);
  }
}

export type GetMeetingOperationInput = { id: string };
export async function getMeetingOperation(
  context: ServerOperationContext,
  operationInput: GetMeetingOperationInput,
) {
  requireMeetingPolicy(context, false);

  await requireMeetingWorkspace(context, operationInput.id);
  const user = requireOperationActor(context);
  try {
    return { meeting: await getMeetingForUser(operationInput.id, user.id) };
  } catch (error) {
    return serviceError(error);
  }
}

export type PrepareMeetingCollaborationOperationInput = {
  id: string;
  collaborationWebsocketUrl: string;
};
export async function prepareMeetingCollaborationOperation(
  context: ServerOperationContext,
  operationInput: PrepareMeetingCollaborationOperationInput,
) {
  requireMeetingPolicy(context, true);

  await requireMeetingWorkspace(context, operationInput.id);
  const user = requireOperationActor(context);
  try {
    const existing = await getMeetingForUser(operationInput.id, user.id);
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
      context.env,
      {
        maxExpiresAt: await getWorkspaceRealtimeAccessExpiration(existing.workspaceId, user.id),
      },
    );
    const websocketUrl = new URL(operationInput.collaborationWebsocketUrl);
    websocketUrl.searchParams.set("document", documentName);
    return {
      documentName,
      websocketUrl: websocketUrl.toString(),
      ...ticket,
    };
  } catch (error) {
    return serviceError(error);
  }
}

export type ClaimMeetingRecorderOperationInput = { id: string; audioWebsocketUrl: string };
export async function claimMeetingRecorderOperation(
  context: ServerOperationContext,
  operationInput: ClaimMeetingRecorderOperationInput,
) {
  requireMeetingPolicy(context, true);

  await requireMeetingWorkspace(context, operationInput.id);
  const user = requireOperationActor(context);
  try {
    const lease = await claimMeetingRecorder({
      env: context.env,
      meetingId: operationInput.id,
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
      context.env,
    );
    const websocketUrl = new URL(operationInput.audioWebsocketUrl);
    websocketUrl.searchParams.set("meeting", lease.meeting.id);
    return {
      expiresAt: ticket.expiresAt,
      leaseExpiresAt: lease.leaseExpiresAt.toISOString(),
      leaseId: lease.leaseId,
      meeting: lease.meeting,
      token: ticket.token,
      websocketUrl: websocketUrl.toString(),
    };
  } catch (error) {
    return serviceError(error);
  }
}

export type RecordMeetingConsentOperationInput = { id: string; body?: unknown };
export async function recordMeetingConsentOperation(
  context: ServerOperationContext,
  operationInput: RecordMeetingConsentOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireMeetingPolicy(context, true);

  await requireMeetingWorkspace(context, operationInput.id);
  const user = requireOperationActor(context);
  const parsed = await parseOperationBody(ConsentInput, readBody);
  if (!parsed.ok) return deny({ error: "Invalid consent event" }, 400);
  try {
    return {
      consent: await recordMeetingConsent({
        ...parsed.data,
        meetingId: operationInput.id,
        userId: user.id,
      }),
    };
  } catch (error) {
    return serviceError(error);
  }
}

export type ReleaseMeetingRecorderOperationInput = { id: string; body?: unknown };
export async function releaseMeetingRecorderOperation(
  context: ServerOperationContext,
  operationInput: ReleaseMeetingRecorderOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireMeetingPolicy(context, true);

  await requireMeetingWorkspace(context, operationInput.id);
  const user = requireOperationActor(context);
  const parsed = await parseOperationBody(RecorderLeaseInput, readBody);
  if (!parsed.ok) return deny({ error: "Invalid recorder lease" }, 400);
  try {
    return {
      meeting: await releaseMeetingRecorder({
        env: context.env,
        leaseId: parsed.data.leaseId,
        meetingId: operationInput.id,
        userId: user.id,
      }),
    };
  } catch (error) {
    return serviceError(error);
  }
}

export type UpdateMeetingOperationInput = { id: string; body?: unknown };
export async function updateMeetingOperation(
  context: ServerOperationContext,
  operationInput: UpdateMeetingOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireMeetingPolicy(context, true);

  await requireMeetingWorkspace(context, operationInput.id);
  const user = requireOperationActor(context);
  const parsed = await parseOperationBody(UpdateMeetingInput, readBody);
  if (!parsed.ok) {
    return deny({ error: "Invalid meeting patch" }, 400);
  }
  try {
    return {
      meeting: await updateMeeting({
        meetingId: operationInput.id,
        patch: parsed.data,
        userId: user.id,
      }),
    };
  } catch (error) {
    return serviceError(error);
  }
}

export type TransitionMeetingOperationInput = {
  action: (typeof meetingLifecycleActions)[number];
  id: string;
  body?: unknown;
};
export async function transitionMeetingOperation(
  context: ServerOperationContext,
  operationInput: TransitionMeetingOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireMeetingPolicy(context, true);

  await requireMeetingWorkspace(context, operationInput.id);
  const user = requireOperationActor(context);
  const parsed = await parseOperationBody(LifecycleInput, readBody);
  if (!parsed.ok) {
    return deny({ error: "Invalid lifecycle payload" }, 400);
  }
  try {
    return {
      meeting: await transitionMeeting({
        action: operationInput.action,
        durationMs: parsed.data.durationMs,
        env: context.env,
        leaseId: parsed.data.leaseId,
        meetingId: operationInput.id,
        userId: user.id,
      }),
    };
  } catch (error) {
    return serviceError(error);
  }
}

export type DeleteMeetingOperationInput = { id: string };
export async function deleteMeetingOperation(
  context: ServerOperationContext,
  operationInput: DeleteMeetingOperationInput,
) {
  requireMeetingPolicy(context, true);

  await requireMeetingWorkspace(context, operationInput.id);
  const user = requireOperationActor(context);
  try {
    return {
      meeting: await deleteMeeting({
        env: context.env,
        meetingId: operationInput.id,
        userId: user.id,
      }),
    };
  } catch (error) {
    return serviceError(error);
  }
}

function deny(body: Record<string, unknown>, status: number): never {
  throw new ServerOperationError(body, status);
}

async function requireMeetingWorkspace(context: ServerOperationContext, id: string) {
  if (!context.pinnedWorkspaceId) return;
  const user = requireOperationActor(context);
  const record = await getMeetingForUser(id, user.id);
  requireOperationWorkspace(context, record.workspaceId);
}

function requireMeetingPolicy(context: ServerOperationContext, write: boolean) {
  requireOperationPolicy(context, { write, oauthScope: undefined });
  if (context.env.MEETING_BLOCK_ENABLED !== "true")
    throw new ServerOperationError({ error: "Meeting blocks are not enabled" }, 404);
}
