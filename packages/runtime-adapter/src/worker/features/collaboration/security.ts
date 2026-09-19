import { COLLABORATION_WEBSOCKET_PROTOCOL } from "@zilobase/server/adapter-api";

export const MAX_COLLABORATION_MESSAGE_BYTES = 1024 * 1024;

export type CollaborationRouteEnv = {
  COLLABORATION_RATE_LIMITER: Pick<RateLimit, "limit">;
  PAGE_COLLABORATION: {
    getByName(name: string): {
      fetch(request: Request): Promise<Response>;
    };
  };
};

type CollaborationUpgradeValidation =
  | { documentName: string; ok: true }
  | { ok: false; response: Response };

export async function routeCollaborationRequest(
  request: Request,
  env: CollaborationRouteEnv,
  authenticate: (request: Request) => Promise<string | null>,
  parsePageId: (documentName: string) => string | null,
) {
  const startedAt = performance.now();
  const validation = validateCollaborationUpgradeRequest(request, parsePageId);
  if (!validation.ok) return validation.response;
  const { documentName } = validation;

  const authenticateStartedAt = performance.now();
  const userId = await authenticate(request);
  const authenticateMs = Math.round(performance.now() - authenticateStartedAt);

  if (!userId) {
    console.info(JSON.stringify({
      authenticateMs,
      event: "collaboration_upgrade",
      outcome: "unauthorized",
      totalMs: Math.round(performance.now() - startedAt),
    }));
    return new Response("Unauthorized", { status: 401 });
  }

  const rateLimitStartedAt = performance.now();
  const { success } = await env.COLLABORATION_RATE_LIMITER.limit({
    key: `collaboration-connect:${userId}`,
  });
  const rateLimitMs = Math.round(performance.now() - rateLimitStartedAt);

  if (!success) {
    console.warn(JSON.stringify({
      event: "collaboration_connection_rate_limited",
      authenticateMs,
      rateLimitMs,
      userId,
    }));
    return new Response("Too Many Requests", {
      headers: { "Retry-After": "60" },
      status: 429,
    });
  }

  const durableObjectStartedAt = performance.now();
  const response = await env.PAGE_COLLABORATION
    .getByName(documentName)
    .fetch(request);

  console.info(JSON.stringify({
    authenticateMs,
    durableObjectMs: Math.round(performance.now() - durableObjectStartedAt),
    event: "collaboration_upgrade",
    outcome: "accepted",
    rateLimitMs,
    status: response.status,
    totalMs: Math.round(performance.now() - startedAt),
  }));

  return response;
}

export function validateCollaborationUpgradeRequest(
  request: Request,
  parseDocumentId: (documentName: string) => string | null,
): CollaborationUpgradeValidation {
  if (request.method !== "GET") {
    return {
      ok: false,
      response: new Response("Method Not Allowed", { status: 405 }),
    };
  }

  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return {
      ok: false,
      response: new Response("Expected a WebSocket upgrade", { status: 426 }),
    };
  }

  const documentName = new URL(request.url).searchParams.get("document");
  const documentId = documentName ? parseDocumentId(documentName) : null;

  if (!documentName || !documentId || documentId.length > 128) {
    return {
      ok: false,
      response: new Response("Invalid collaboration document", { status: 400 }),
    };
  }

  return { documentName, ok: true };
}

export function validateCollaborationMessage(
  rawMessage: string | ArrayBuffer,
):
  | { code: number; messageBytes: number | null; ok: false; reason: string }
  | { message: Uint8Array; ok: true } {
  const message = readBinaryMessage(rawMessage);

  if (!message) {
    return {
      code: 1003,
      messageBytes: null,
      ok: false,
      reason: "Binary WebSocket messages are required",
    };
  }

  if (message.byteLength > MAX_COLLABORATION_MESSAGE_BYTES) {
    return {
      code: 1009,
      messageBytes: message.byteLength,
      ok: false,
      reason: "Collaboration message is too large",
    };
  }

  return { message, ok: true };
}

export function selectCollaborationWebSocketProtocol(headers: Headers) {
  return (headers.get("sec-websocket-protocol") ?? "")
    .split(",")
    .map((protocol) => protocol.trim())
    .includes(COLLABORATION_WEBSOCKET_PROTOCOL)
    ? COLLABORATION_WEBSOCKET_PROTOCOL
    : null;
}

function readBinaryMessage(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }

  return null;
}
