import { z } from "zod";
import {
  requireOperationPolicy,
  requireOperationWorkspace,
  ServerOperationError,
  type ServerOperationContext,
} from "../../operations/context";
import { requireCalendarMembership } from "../connections/ownership";
import { calendarWriteSchema, type CalendarMutationAction } from "./input";
import { mutateCalendarEvent, reconcileCalendarOperation } from "./mutations";
const CalendarMutationActionSchema = z.enum(["update", "delete", "duplicate", "rsvp", "move"]);
const CalendarMutationExtra = z.object({
  destination: z.string().max(1024).optional(),
  responseStatus: z.enum(["accepted", "declined", "tentative"]).optional(),
});
export type CreateCalendarEventOperationInput = {
  workspaceId: string;
  bindingId: string;
  calendarId: string;
  body?: unknown;
};
export async function createCalendarEventOperation(
  context: ServerOperationContext,
  operationInput: CreateCalendarEventOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  if (!context.authentication.user)
    throw new ServerOperationError({ message: "Authentication required." }, 401);
  const actor = context.authentication.user;
  requireOperationWorkspace(context, operationInput.workspaceId);
  await requireCalendarMembership(actor.id, operationInput.workspaceId);

  const write = calendarWriteSchema.parse(await readBody());
  const result = await mutateCalendarEvent(context.env, {
    userId: context.authentication.user!.id,
    workspaceId: operationInput.workspaceId!,
    bindingId: operationInput.bindingId,
    calendarId: operationInput.calendarId,
    action: "create",
    write,
  });
  return result;
}

export type MutateCalendarEventOperationInput = {
  action: string;
  workspaceId: string;
  bindingId: string;
  calendarId: string;
  eventId: string;
  body?: unknown;
};
export async function mutateCalendarEventOperation(
  context: ServerOperationContext,
  operationInput: MutateCalendarEventOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  if (!context.authentication.user)
    throw new ServerOperationError({ message: "Authentication required." }, 401);
  const actor = context.authentication.user;
  requireOperationWorkspace(context, operationInput.workspaceId);
  await requireCalendarMembership(actor.id, operationInput.workspaceId);

  const action = CalendarMutationActionSchema.parse(
    operationInput.action,
  ) as CalendarMutationAction;
  const body = await readBody();
  const write = calendarWriteSchema.parse(body);
  const extra = CalendarMutationExtra.parse(body);
  const result = await mutateCalendarEvent(context.env, {
    userId: context.authentication.user!.id,
    workspaceId: operationInput.workspaceId!,
    bindingId: operationInput.bindingId,
    calendarId: operationInput.calendarId,
    eventId: operationInput.eventId,
    action,
    write,
    ...extra,
  });
  return result;
}

export type ReconcileCalendarEventOperationInput = { workspaceId: string; operationId: string };
export async function reconcileCalendarEventOperation(
  context: ServerOperationContext,
  operationInput: ReconcileCalendarEventOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  if (!context.authentication.user)
    throw new ServerOperationError({ message: "Authentication required." }, 401);
  const actor = context.authentication.user;
  requireOperationWorkspace(context, operationInput.workspaceId);
  await requireCalendarMembership(actor.id, operationInput.workspaceId);

  return await reconcileCalendarOperation(context.env, {
    userId: context.authentication.user!.id,
    workspaceId: operationInput.workspaceId!,
    operationId: operationInput.operationId,
  });
}

function operationValue<T>(body: T, status: number): T {
  if (status >= 400) throw new ServerOperationError(body as Record<string, unknown>, status);
  return body;
}
