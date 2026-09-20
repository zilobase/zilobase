import {
  createDbClient,
  createAuth,
  getAuthHeaders as getServerAuthHeaders,
  getAiChatThreadForUser,
  getMembership,
  isAllowedClientOrigin,
  isLocalDevelopmentHost,
  meetingIdFromDocumentName,
  pageIdFromDocumentName,
  runWithDbClient,
  runWithDbEnv,
  runWithRuntimeAdapter,
  setRuntimeAdapter,
  type AppBindings,
  type AppErrorReport,
  type ServerRuntimeAdapter,
  type ZilobaseEditionExtension,
} from "@zilobase/server/adapter-api";
import type { AppPolicy } from "@zilobase/runtime-ports";

import { CalendarNotificationRoom } from "./features/calendar-realtime/calendar-notification-room";
import { routeCalendarRealtimeRequest, type CalendarRealtimeRouteEnv } from "./features/calendar-realtime/security";
import { parseChatAgentInstanceName } from "./features/chat/chat-agent-identity";
import { PageCollaborationRoom } from "./features/collaboration/page-collaboration-room";
import { MeetingCollaborationRoom } from "./features/collaboration/meeting-collaboration-room";
import { routeCollaborationRequest, type CollaborationRouteEnv } from "./features/collaboration/security";
import { DatabaseCollaborationRoom } from "./features/database-realtime/database-collaboration-room";
import { routeDatabaseRealtimeRequest, type DatabaseRealtimeRouteEnv } from "./features/database-realtime/security";
import { routeMeetingAudioRequest, type MeetingAudioRouteEnv } from "./features/meeting-audio/security";
import { MailNotificationRoom } from "./features/mail-realtime/mail-notification-room";
import { routeMailRealtimeRequest, type MailRealtimeRouteEnv } from "./features/mail-realtime/security";
import { NavigationNotificationRoom } from "./features/navigation-realtime/navigation-notification-room";
import { routeNavigationRealtimeRequest, type NavigationRealtimeRouteEnv } from "./features/navigation-realtime/security";
import { createWorkerAdapter, type WorkerEnvBindings } from "./adapter";
import { createWorkerHandler } from "./handler";

export { routeCollaborationRequest } from "./features/collaboration/security";
export type { CollaborationRouteEnv } from "./features/collaboration/security";

export {
  DatabaseCollaborationRoom,
  MeetingCollaborationRoom,
  MailNotificationRoom,
  CalendarNotificationRoom,
  NavigationNotificationRoom,
  PageCollaborationRoom,
};
export { ChatAgent } from "./features/chat/chat-agent";

export type FetchableApp = {
  fetch(
    request: Request,
    env: Record<string, unknown>,
    ctx: unknown,
  ): Response | Promise<Response>;
};

export type WorkerRuntimeOptions<Env extends WorkerEnvBindings = WorkerEnvBindings> = {
  loadApp: (env: Env) => Promise<FetchableApp>;
  adapter?: ServerRuntimeAdapter;
  getEditionExtension?: (env: Env) => ZilobaseEditionExtension | undefined;
  reportError?: (env: Env, report: AppErrorReport) => void | Promise<void>;
  reportEvent?: (env: Env, event: string, props?: Record<string, unknown>) => void | Promise<void>;
  demoGuard?: {
    isDemoRequest: (req: Request, env: Env) => boolean;
    isDisabledPath: (pathname: string) => boolean;
    readOnlyResponse: () => Response;
    applyReadRateLimit?: (req: Request, env: Env) => Promise<Response | null>;
  };
  getSessionPolicyDenial?: (args: {
    env: Env;
    request: Request;
    database: unknown;
    session: {
      session: { activeOrganizationId?: string | null; activeWorkspaceId?: string | null; id: string };
      user: { email?: string | null; id: string };
    };
  }) => Promise<{ code: string; message: string; status: number } | null>;
  cors?: { isAllowedOrigin: (env: Env, origin: string) => boolean };
  policy?: AppPolicy;
};

const communityWorkerPolicy: AppPolicy = {
  compression: false,
  registration: "bootstrap",
  webhookHttpDomains: new Set(),
  workspaceSelection: "pinned",
};

export function createWorker<Env extends WorkerEnvBindings = WorkerEnvBindings>(
  opts: WorkerRuntimeOptions<Env>,
): { fetch: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response> } {
  const adapter = opts.adapter ?? createWorkerAdapter();
  const policy = opts.policy ?? communityWorkerPolicy;
  // Durable Object callbacks are invoked outside the module fetch handler, so
  // retain the bootstrap default while request handlers use isolated contexts.
  setRuntimeAdapter(adapter);

  let editionExtension: ZilobaseEditionExtension | null | undefined;
  let extensionResolved = false;
  const resolveEditionExtension = (env: Env) => {
    if (!extensionResolved) {
      editionExtension = opts.getEditionExtension?.(env);
      extensionResolved = true;
    }
    return editionExtension;
  };

  const reportError = (env: Env, report: AppErrorReport) => {
    if (opts.reportError) return opts.reportError(env, report);
    console.error(
      JSON.stringify({
        code: report.code,
        event: "worker.app_error",
        method: report.method,
        request_id: report.requestId,
        route: report.route,
        status: report.status,
      }),
    );
  };

  const appHandler = createWorkerHandler<Env, FetchableApp>({
    authenticateAgentRequest: (request, lobby, env) =>
      authenticateAgentRequest(request, lobby, env),
    authorizeAgentRequest: (request, lobby, env) =>
      authorizeAgentRequest(request, lobby, env),
    getAgentCorsHeaders: (env, request) => getAgentCorsHeaders(env, request),
    loadApp: opts.loadApp,
  });

  async function fetchApp(request: Request, env: Env, ctx: unknown) {
    return runWithDbRequest(env, () =>
      appHandler.fetch(request, env, ctx));
  }

  async function getCollaborationUserId(request: Request, env: Env) {
    return runWithDbRequest(env, async (database) => {
      const extension = resolveEditionExtension(env);
      const auth = await createAuth(env, request, database, {
        ...(extension ? { editionExtension: extension } : {}),
        policy,
      });
      const session = await auth.api.getSession({
        headers: await getServerAuthHeaders(auth, request.headers),
      });
      if (session?.user && await sessionPolicyDenial(env, request, database, session)) return null;
      return session?.user?.id ?? null;
    });
  }

  async function authenticateAgentRequest(
    request: Request,
    _lobby: unknown,
    env: Env,
  ) {
    const authResult = await getAgentAuthContext(request, env);

    if (authResult instanceof Response) {
      return authResult;
    }
  }

  async function authorizeAgentRequest(
    request: Request,
    _lobby: unknown,
    env: Env,
  ) {
    const authResult = await getAgentAuthContext(request, env);

    if (authResult instanceof Response) {
      return authResult;
    }

    const { session, workspaceId } = authResult;
    const instance = readAgentInstanceName(request);
    if (!instance) {
      return new Response("Invalid agent instance.", { status: 404 });
    }

    const userId = session?.user?.id;

    if (!workspaceId || !userId) {
      return;
    }

    const parsedInstance = parseChatAgentInstanceName(instance);

    if (
      !parsedInstance ||
      parsedInstance.workspaceId !== workspaceId ||
      parsedInstance.userId !== userId
    ) {
      return new Response("Forbidden", { status: 403 });
    }

    const thread = await runWithDbEnv(env, () =>
      getAiChatThreadForUser({
        workspaceId,
        threadId: parsedInstance.threadId,
        userId,
      }),
    );

    if (!thread) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  async function getAgentAuthContext(request: Request, env: Env) {
    return runWithDbRequest(env, async (database) => {
      const authHeaders = getAuthHeaders(request.headers);
      const extension = resolveEditionExtension(env);
      const auth = await createAuth(env, request, database, {
        ...(extension ? { editionExtension: extension } : {}),
        policy,
      });
      const session = await auth.api.getSession({ headers: authHeaders });
      const workspaceId =
        readAgentWorkspaceId(request) ??
        request.headers.get("x-zilobase-workspace-id")?.trim() ??
        null;

      if (!session?.user) {
        return new Response("Unauthorized", { status: 401 });
      }

      const denial = await sessionPolicyDenial(env, request, database, session);
      if (denial) {
        return Response.json(
          { code: denial.code, message: denial.message },
          { status: denial.status },
        );
      }

      if (!workspaceId) {
        return new Response("Missing workspace", { status: 409 });
      }

      if (!(await getMembership(workspaceId, session.user.id))) {
        return new Response("Forbidden", { status: 403 });
      }

      return { session, workspaceId };
    });
  }

  function getAgentCorsHeaders(env: Env, request: Request) {
    const headers = new Headers();
    const origin = request.headers.get("origin");

    if (!origin || isAgentOriginAllowed(env, origin)) {
      headers.set("Access-Control-Allow-Origin", origin ?? "*");
      headers.set("Access-Control-Allow-Credentials", "true");
      headers.set(
        "Access-Control-Allow-Headers",
        "authorization, content-type, x-mobile-auth-cookie, x-zilobase-workspace-id",
      );
      headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
      headers.set("Vary", "Origin");
    }

    return Object.fromEntries(headers.entries());
  }

  function isAgentOriginAllowed(env: Env, origin: string) {
    if (opts.cors) return opts.cors.isAllowedOrigin(env, origin);
    return (
      isAllowedClientOrigin(env, origin) ||
      isLocalDevelopmentHost(getOriginHost(origin))
    );
  }

  async function sessionPolicyDenial(
    env: Env,
    request: Request,
    database: unknown,
    session: {
      session: { activeOrganizationId?: string | null; activeWorkspaceId?: string | null; id: string };
      user: { email?: string | null; id: string };
    },
  ) {
    if (opts.getSessionPolicyDenial) {
      return opts.getSessionPolicyDenial({ database, env, request, session });
    }
    const extension = resolveEditionExtension(env);
    return extension?.assertSession?.({
      authMethod: "session",
      database: database as never,
      request,
      session: {
        ...session.session,
        activeWorkspaceId:
          session.session.activeWorkspaceId ??
          session.session.activeOrganizationId ??
          null,
      },
      user: session.user,
    }) ?? null;
  }

  return {
    async fetch(request: Request, env: Env, ctx: ExecutionContext) {
      request = withRequestId(request);
      try {
        return await runWithRuntimeAdapter(adapter, () => {
          const pathname = new URL(request.url).pathname;

          if (opts.demoGuard?.isDemoRequest(request, env)) {
            if (opts.demoGuard.isDisabledPath(pathname)) {
              return opts.demoGuard.readOnlyResponse();
            }

            if (request.method === "GET" || request.method === "HEAD") {
              if (!opts.demoGuard.applyReadRateLimit) {
                return fetchApp(request, env, ctx);
              }
              return opts.demoGuard.applyReadRateLimit(request, env).then(
                (limited) => limited ?? fetchApp(request, env, ctx),
              );
            }
          }

          if (pathname === "/collaboration") {
            return routeCollaborationRequest(
              request,
              env as unknown as CollaborationRouteEnv,
              (collaborationRequest) =>
                getCollaborationUserId(collaborationRequest, env),
              pageIdFromDocumentName,
            );
          }

          if (pathname === "/meeting-collaboration") {
            return routeCollaborationRequest(
              request,
              {
                COLLABORATION_RATE_LIMITER: (env as Record<string, unknown>).COLLABORATION_RATE_LIMITER,
                PAGE_COLLABORATION: (env as Record<string, unknown>).MEETING_COLLABORATION,
              } as unknown as CollaborationRouteEnv,
              (collaborationRequest) =>
                getCollaborationUserId(collaborationRequest, env),
              meetingIdFromDocumentName,
            );
          }

          if (pathname === "/database-collaboration") {
            return routeDatabaseRealtimeRequest(request, env as unknown as DatabaseRealtimeRouteEnv);
          }

          if (pathname === "/meeting-audio") {
            return routeMeetingAudioRequest(request, env as unknown as MeetingAudioRouteEnv, ctx);
          }

          if (pathname === "/calendar-realtime") return routeCalendarRealtimeRequest(request, env as unknown as CalendarRealtimeRouteEnv);
          if (pathname === "/mail-realtime") {
            return routeMailRealtimeRequest(request, env as unknown as MailRealtimeRouteEnv);
          }

          if (pathname === "/navigation-realtime") {
            return routeNavigationRealtimeRequest(request, env as unknown as NavigationRealtimeRouteEnv);
          }

          return fetchApp(request, env, ctx);
        });
      } catch (error) {
        await reportError(env, {
          error,
          method: request.method,
          requestId: request.headers.get("x-zilobase-request-id"),
          route: routeGroup(request),
        } as AppErrorReport);
        if (opts.reportEvent) {
          await opts.reportEvent(env, "worker_request_error", {
            method: request.method,
            request_id: request.headers.get("x-zilobase-request-id"),
            route_group: routeGroup(request),
          });
        }
        throw error;
      }
    },
  };
}

function routeGroup(request: Request) {
  const [group] = new URL(request.url).pathname.split("/").filter(Boolean);
  return group ? `/${group}` : "/";
}

function withRequestId(request: Request) {
  if (request.headers.has("x-zilobase-request-id")) return request;

  const requestId = request.headers.get("cf-ray");
  if (!requestId) return request;

  const headers = new Headers(request.headers);
  headers.set("x-zilobase-request-id", requestId);
  return new Request(request, { headers });
}

async function runWithDbRequest<Env, T>(
  env: Env,
  callback: (database: never) => T,
): Promise<T> {
  const client = createDbClient(env as never);
  return runWithDbClient(client, () => Promise.resolve(callback(client.db as never)));
}

function getAuthHeaders(headers: Headers) {
  const nextHeaders = new Headers(headers);
  const mobileAuthCookie = nextHeaders.get("x-mobile-auth-cookie")?.trim();

  if (!nextHeaders.has("cookie") && mobileAuthCookie) {
    nextHeaders.set("cookie", mobileAuthCookie);
  }

  return nextHeaders;
}

function getOriginHost(origin: string) {
  try {
    return new URL(origin).hostname;
  } catch {
    return "";
  }
}

function readAgentInstanceName(request: Request) {
  const parts = new URL(request.url).pathname
    .replace(/^\/+|\/+$/g, "")
    .split("/");

  return parts.length >= 3 && parts[0] === "agents" ? parts[2] : null;
}

function readAgentWorkspaceId(request: Request) {
  return new URL(request.url).searchParams.get("workspaceId")?.trim() ?? null;
}

export type { AppBindings };
