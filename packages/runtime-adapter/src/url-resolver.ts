import type { Env, RealtimeEndpoint, UrlResolver } from "@zilobase/runtime-ports";

const endpoints: Record<RealtimeEndpoint, { env?: string; path: string }> = {
  calendar: { path: "/calendar-realtime" },
  collaboration: { env: "COLLABORATION_WEBSOCKET_URL", path: "/collaboration" },
  database: { env: "DATABASE_REALTIME_WEBSOCKET_URL", path: "/database-collaboration" },
  mail: { path: "/mail-realtime" },
  "meeting-audio": { env: "MEETING_AUDIO_WEBSOCKET_URL", path: "/meeting-audio" },
  "meeting-collaboration": { env: "MEETING_COLLABORATION_WEBSOCKET_URL", path: "/meeting-collaboration" },
  navigation: { env: "NAVIGATION_REALTIME_WEBSOCKET_URL", path: "/navigation-realtime" },
};

export function createUrlResolver(env: Env): UrlResolver {
  return {
    getCollabUrl(endpoint, request) {
      const config = endpoints[endpoint];
      const explicit = config.env ? env.get(config.env) : undefined;
      if (explicit) return explicit;
      const url = new URL(request.url);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.pathname = config.path;
      url.search = "";
      url.hash = "";
      return url.toString();
    },
  };
}
