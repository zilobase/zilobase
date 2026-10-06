import { DurableObject } from "cloudflare:workers";
import type { WorkerEnvBindings } from "../../bindings";

/** Retained only for Cloudflare's existing class/migration declaration boundary. */
export class NavigationNotificationRoom extends DurableObject<WorkerEnvBindings> {
  constructor(ctx: DurableObjectState, env: WorkerEnvBindings) {
    super(ctx, env);
    for (const socket of ctx.getWebSockets()) socket.close(1001, "Navigation realtime retired");
  }
  async fetch(_request: Request) {
    return new Response("Navigation realtime retired", { status: 410 });
  }
  webSocketMessage(socket: WebSocket, _message: string | ArrayBuffer) {
    socket.close(1001, "Navigation realtime retired");
  }
}
