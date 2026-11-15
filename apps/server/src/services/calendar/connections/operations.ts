import { z } from "zod";
import { getStringEnv } from "../../../shared/config/config";
import {
  requireOperationPolicy,
  requireOperationWorkspace,
  ServerOperationError,
  type ServerOperationContext,
} from "../../operations/context";
import { requireCalendarMembership } from "../connections/ownership";
import { beginCalendarOAuth, createCalendarGateway } from "../provider/oauth";
import { personalCalendarSources } from "./catalog";
import { disconnectOwnedCalendar, listCalendarConnections } from "./connections";
import { requireCalendarBinding } from "./ownership";
const GoogleOAuthStart = z.object({
  client: z.enum(["web", "desktop"]),
});
export type ListCalendarConnectionsOperationInput = { workspaceId: string };
export async function listCalendarConnectionsOperation(
  context: ServerOperationContext,
  operationInput: ListCalendarConnectionsOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  if (!context.authentication.user)
    throw new ServerOperationError({ message: "Authentication required." }, 401);
  const actor = context.authentication.user;
  requireOperationWorkspace(context, operationInput.workspaceId);
  await requireCalendarMembership(actor.id, operationInput.workspaceId);

  return await listCalendarConnections(
    context.authentication.user!.id,
    operationInput.workspaceId!,
    context.env,
  );
}

export type ListCalendarSourcesOperationInput = { workspaceId: string };
export async function listCalendarSourcesOperation(
  context: ServerOperationContext,
  operationInput: ListCalendarSourcesOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  if (!context.authentication.user)
    throw new ServerOperationError({ message: "Authentication required." }, 401);
  const actor = context.authentication.user;
  requireOperationWorkspace(context, operationInput.workspaceId);
  await requireCalendarMembership(actor.id, operationInput.workspaceId);

  return {
    connections: await personalCalendarSources(
      context.authentication.user!.id,
      operationInput.workspaceId!,
    ),
    providerConfigured: Boolean(
      getStringEnv(context.env, "CALENDAR_GOOGLE_CLIENT_ID") &&
      getStringEnv(context.env, "CALENDAR_GOOGLE_CLIENT_SECRET") &&
      getStringEnv(context.env, "CALENDAR_TOKEN_ENCRYPTION_KEY"),
    ),
  };
}

export type ConnectCalendarOperationInput = { workspaceId: string; body?: unknown };
export async function connectCalendarOperation(
  context: ServerOperationContext,
  operationInput: ConnectCalendarOperationInput,
  readBody: () => Promise<unknown> = async () => operationInput.body,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  if (!context.authentication.user)
    throw new ServerOperationError({ message: "Authentication required." }, 401);
  const actor = context.authentication.user;
  requireOperationWorkspace(context, operationInput.workspaceId);
  await requireCalendarMembership(actor.id, operationInput.workspaceId);

  const body = GoogleOAuthStart.parse(await readBody());
  return {
    authorizationUrl: await beginCalendarOAuth(context.env, {
      userId: context.authentication.user!.id,
      workspaceId: operationInput.workspaceId!,
      clientKind: body.client,
    }),
  };
}

export type DisconnectCalendarOperationInput = { workspaceId: string; bindingId: string };
export async function disconnectCalendarOperation(
  context: ServerOperationContext,
  operationInput: DisconnectCalendarOperationInput,
) {
  requireOperationPolicy(context, { write: true, oauthScope: undefined });
  if (!context.authentication.user)
    throw new ServerOperationError({ message: "Authentication required." }, 401);
  const actor = context.authentication.user;
  requireOperationWorkspace(context, operationInput.workspaceId);
  await requireCalendarMembership(actor.id, operationInput.workspaceId);

  const owned = await requireCalendarBinding(
    context.authentication.user!.id,
    operationInput.workspaceId!,
    operationInput.bindingId,
  );
  await disconnectOwnedCalendar(
    owned,
    context.authentication.user!.id,
    operationInput.workspaceId!,
    operationInput.bindingId,
    context.env,
  );
  return { disconnected: true };
}

export type ListProviderCalendarsOperationInput = { workspaceId: string; bindingId: string };
export async function listProviderCalendarsOperation(
  context: ServerOperationContext,
  operationInput: ListProviderCalendarsOperationInput,
) {
  requireOperationPolicy(context, { write: false, oauthScope: undefined });
  if (!context.authentication.user)
    throw new ServerOperationError({ message: "Authentication required." }, 401);
  const actor = context.authentication.user;
  requireOperationWorkspace(context, operationInput.workspaceId);
  await requireCalendarMembership(actor.id, operationInput.workspaceId);

  const row = await requireCalendarBinding(
    context.authentication.user!.id,
    operationInput.workspaceId!,
    operationInput.bindingId,
  );
  return {
    calendars: await (
      await createCalendarGateway(context.env, row.account)
    ).calendars(row.binding.id),
  };
}
