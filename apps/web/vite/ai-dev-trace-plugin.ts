import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { IncomingMessage } from "node:http";
import type { Plugin } from "vite";

const TRACE_ENDPOINT = "/__zilobase_dev/ai-trace";
const MAX_REQUEST_BYTES = 1_000_000;
const SAFE_ID = /^[a-zA-Z0-9_-]{1,160}$/;

type DevTraceEvent = {
  occurredAt: string;
  payload: unknown;
  sequence: number;
  type: string;
};

type DevTraceRequest = {
  events: DevTraceEvent[];
  sessionId: string;
  threadId: string;
  workspaceId: string | null;
};

export function aiDevTracePlugin(repoRoot: string): Plugin {
  const traceDirectory = path.join(repoRoot, ".dev", "ai-thread-logs");
  const pendingWrites = new Map<string, Promise<void>>();

  return {
    apply: "serve",
    name: "zilobase-ai-dev-trace",
    configureServer(server) {
      server.middlewares.use(TRACE_ENDPOINT, async (request, response) => {
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.end();
          return;
        }

        try {
          const input = parseTraceRequest(await readRequestBody(request));
          const filePath = path.join(traceDirectory, `${input.threadId}.jsonl`);
          const lines = input.events.map((event) => JSON.stringify({
            ...event,
            receivedAt: new Date().toISOString(),
            sessionId: input.sessionId,
            threadId: input.threadId,
            workspaceId: input.workspaceId,
          })).join("\n") + "\n";

          const previous = pendingWrites.get(input.threadId) ?? Promise.resolve();
          const next = previous.catch(() => undefined).then(async () => {
            await mkdir(traceDirectory, { recursive: true });
            await appendFile(filePath, lines, "utf8");
          });
          pendingWrites.set(input.threadId, next);
          await next;
          if (pendingWrites.get(input.threadId) === next) {
            pendingWrites.delete(input.threadId);
          }

          response.statusCode = 204;
          response.end();
        } catch (error) {
          server.config.logger.error(
            `AI development trace write failed: ${error instanceof Error ? error.message : String(error)}`,
          );
          response.statusCode = 400;
          response.end();
        }
      });
    },
  };
}

async function readRequestBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) throw new Error("Trace request is too large");
    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function parseTraceRequest(value: unknown): DevTraceRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid trace request");
  }

  const input = value as Record<string, unknown>;
  if (!SAFE_ID.test(String(input.threadId ?? ""))) {
    throw new Error("Invalid thread id");
  }
  if (!SAFE_ID.test(String(input.sessionId ?? ""))) {
    throw new Error("Invalid trace session id");
  }
  if (!Array.isArray(input.events) || input.events.length === 0 || input.events.length > 100) {
    throw new Error("Invalid trace event batch");
  }

  const events = input.events.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid trace event");
    }
    const event = value as Record<string, unknown>;
    if (
      typeof event.type !== "string" ||
      event.type.length === 0 ||
      event.type.length > 80 ||
      typeof event.sequence !== "number" ||
      !Number.isSafeInteger(event.sequence) ||
      typeof event.occurredAt !== "string"
    ) {
      throw new Error("Invalid trace event");
    }
    return {
      occurredAt: event.occurredAt,
      payload: event.payload,
      sequence: event.sequence,
      type: event.type,
    };
  });

  return {
    events,
    sessionId: String(input.sessionId),
    threadId: String(input.threadId),
    workspaceId: typeof input.workspaceId === "string" ? input.workspaceId : null,
  };
}
