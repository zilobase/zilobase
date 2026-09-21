import { routeAgentRequest } from "agents";

import type { WorkerEnvBindings } from "./bindings";

type FetchableApp = {
  fetch(
    request: Request,
    env: Record<string, unknown>,
    ctx: unknown,
  ): Response | Promise<Response>;
};

export function createWorkerHandler<
  Env extends WorkerEnvBindings,
  App extends FetchableApp,
>(options: {
  authorizeAgentRequest?: (
    request: Request,
    lobby: unknown,
    env: Env,
  ) => Promise<Response | void> | Response | void;
  authenticateAgentRequest?: (
    request: Request,
    lobby: unknown,
    env: Env,
  ) => Promise<Response | void> | Response | void;
  getAgentCorsHeaders?: (
    env: Env,
    request: Request,
  ) => Record<string, string>;
  loadApp: (env: Env) => Promise<App>;
}) {
  let appPromise: Promise<App> | null = null;

  return {
    async fetch(request: Request, env: Env, ctx: unknown) {
      const timing = createRequestTiming(request);
      const agentResponse = isAgentRequest(request)
        ? await timed(() =>
            routeAgentRequest(request, env, {
              cors: options.getAgentCorsHeaders?.(env, request),
              onBeforeConnect: options.authorizeAgentRequest
                ? (req: Request, lobby: unknown) =>
                    options.authorizeAgentRequest?.(req, lobby, env)
                : undefined,
              onBeforeRequest: options.authenticateAgentRequest
                ? (req: Request, lobby: unknown) =>
                    options.authenticateAgentRequest?.(req, lobby, env)
                : undefined,
            }),
          )
        : null;

      if (agentResponse?.value) {
        return respondWithTiming(agentResponse.value, timing, {
          routeAgentMs: agentResponse.durationMs,
        });
      }

      appPromise ??= options.loadApp(env);
      const appLoad = await timed(() => appPromise!);
      const appResponse = await timed(() =>
        Promise.resolve(appLoad.value.fetch(request, env, ctx)),
      );

      return respondWithTiming(appResponse.value, timing, {
        appLoadMs: appLoad.durationMs,
        appFetchMs: appResponse.durationMs,
        ...(agentResponse ? { routeAgentMs: agentResponse.durationMs } : {}),
      });
    },
  };
}

function isAgentRequest(request: Request) {
  const pathname = new URL(request.url).pathname;

  return pathname === "/agents" || pathname.startsWith("/agents/");
}

async function timed<T>(run: () => Promise<T>) {
  const startedAt = performance.now();
  const value = await run();

  return {
    durationMs: Math.round(performance.now() - startedAt),
    value,
  };
}

function createRequestTiming(request: Request) {
  const url = new URL(request.url);

  return {
    path: url.pathname,
    requestId: request.headers.get("x-zilobase-request-id") ?? crypto.randomUUID(),
    startedAt: performance.now(),
  };
}

function respondWithTiming(
  response: Response,
  timing: ReturnType<typeof createRequestTiming>,
  metrics: Record<string, number | string>,
) {
  const totalMs = Math.round(performance.now() - timing.startedAt);

  if (response.status === 101) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set("x-zilobase-request-id", timing.requestId);
  headers.set("x-zilobase-worker-path", timing.path);
  headers.append("Server-Timing", formatServerTiming(metrics, totalMs));

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function formatServerTiming(
  metrics: Record<string, number | string>,
  totalMs: number,
) {
  return Object.entries({ ...metrics, totalMs })
    .flatMap(([key, value]) => {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return [];
      }

      const name = key
        .replace(/Ms$/, "")
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .toLowerCase();

      return [`zilobase_${name};dur=${Math.max(0, Math.round(value))}`];
    })
    .join(", ");
}
