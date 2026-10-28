import {
  admitChatRun,
  durableChatEnabled,
  cancelChatRun,
  getChatRequest,
  readChatRun,
  readChatRunDebug,
} from "../../services/ai/runs";
import { chatRunResponse, legacyChatRunResponse } from "./durable-stream";
import { listChatThreads, getChatThread, deleteChatThread } from "../../services/ai/conversations";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { chatRequestSchema } from "@zilobase/features/runtime";
import type { AppBindings } from "../../shared/contracts/http";
import { prepareChat } from "../../services/ai/chat";
import { chatSourceIdentity } from "../../services/ai/context";
import { jsonValidator } from "../http/json";
import { serverOperationContext } from "../http/operation-context";
import { attachServiceErrorHandler } from "../http/route-error";

export const aiRoutes = attachServiceErrorHandler(new Hono<AppBindings>());
aiRoutes.use(
  "*",
  bodyLimit({
    maxSize: 2_000_000,
    onError: (c) => c.json({ error: "Chat request exceeds 2 MB" }, 413),
  }),
);
aiRoutes.post("/chat", jsonValidator(chatRequestSchema), async (c) => {
  const context = serverOperationContext(c);
  if (durableChatEnabled(context.env ?? {}))
    return legacyChatRunResponse(context, await admitChatRun(context, c.req.valid("json")));
  const prepared = await prepareChat(context, c.req.valid("json"));
  const cancellation = new AbortController();
  const signal = AbortSignal.any([c.req.raw.signal, cancellation.signal]);
  const iterator = prepared.events(signal);
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next = await iterator.next();
          if (next.done) controller.close();
          else controller.enqueue(encoder.encode(`${JSON.stringify(next.value)}\n`));
        } catch (error) {
          cancellation.abort();
          controller.error(error);
        }
      },
      async cancel() {
        cancellation.abort();
        await iterator.return(undefined);
        await prepared.cancel();
      },
    }),
    {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    },
  );
});

aiRoutes.get("/threads", async (c) =>
  c.json(await listChatThreads(serverOperationContext(c), c.req.query("workspaceId") ?? "")),
);
aiRoutes.get("/sources/:type/:id", async (c) =>
  c.json(
    await chatSourceIdentity(
      serverOperationContext(c),
      c.req.query("workspaceId") ?? "",
      c.req.param("type"),
      c.req.param("id"),
    ),
  ),
);
aiRoutes.get("/threads/:id", async (c) =>
  c.json(
    await getChatThread(
      serverOperationContext(c),
      c.req.query("workspaceId") ?? "",
      c.req.param("id"),
    ),
  ),
);
aiRoutes.delete("/threads/:id", async (c) =>
  c.json(
    await deleteChatThread(
      serverOperationContext(c),
      c.req.query("workspaceId") ?? "",
      c.req.param("id"),
    ),
  ),
);

aiRoutes.post("/turns", jsonValidator(chatRequestSchema), async (c) =>
  c.json(await admitChatRun(serverOperationContext(c), c.req.valid("json")), 202),
);
aiRoutes.get("/requests/:id", async (c) =>
  c.json(
    await getChatRequest(
      serverOperationContext(c),
      c.req.param("id"),
      c.req.query("workspaceId") ?? "",
    ),
  ),
);
aiRoutes.get("/runs/:id", async (c) =>
  c.json(
    await readChatRun(
      serverOperationContext(c),
      c.req.param("id"),
      c.req.query("workspaceId") ?? "",
    ),
  ),
);
aiRoutes.get("/runs/:id/debug", async (c) => {
  c.header("Cache-Control", "no-store");
  return c.json(
    await readChatRunDebug(
      serverOperationContext(c),
      c.req.param("id"),
      c.req.query("workspaceId") ?? "",
    ),
  );
});
aiRoutes.get("/runs/:id/events", async (c) => {
  const after = Number(c.req.query("after") ?? 0);
  if (!Number.isSafeInteger(after) || after < 0)
    return c.json({ error: "Invalid stream cursor" }, 400);
  const context = serverOperationContext(c);
  const receipt = await readChatRun(context, c.req.param("id"), c.req.query("workspaceId") ?? "");
  return chatRunResponse(context, receipt, after);
});
aiRoutes.post("/runs/:id/cancel", async (c) =>
  c.json(
    await cancelChatRun(
      serverOperationContext(c),
      c.req.param("id"),
      c.req.query("workspaceId") ?? "",
    ),
  ),
);

aiRoutes.get("/capabilities", (c) =>
  c.json({ durable: durableChatEnabled(serverOperationContext(c).env) }),
);
