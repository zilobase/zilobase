import { apiUrl } from "./config.mjs";

export function applyPublicDevelopmentOrigin(env, profile) {
  const configured = env.ZILOBASE_DEV_PUBLIC_ORIGIN?.trim();
  if (!configured) return env;
  const url = new URL(configured);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "ZILOBASE_DEV_PUBLIC_ORIGIN must be an HTTPS origin without a path or credentials.",
    );
  }
  const origin = url.origin;
  return {
    ...env,
    BETTER_AUTH_URL: origin,
    CLIENT_URL: origin,
    VITE_API_URL: origin,
    VITE_BACKEND_PROXY_TARGET: apiUrl(profile),
    VITE_DEV_PUBLIC_ORIGIN: origin,
    COLLABORATION_WEBSOCKET_URL: origin.replace("https:", "wss:") + "/collaboration",
    DATABASE_REALTIME_WEBSOCKET_URL: origin.replace("https:", "wss:") + "/database-collaboration",
    MEETING_AUDIO_WEBSOCKET_URL: origin.replace("https:", "wss:") + "/meeting-audio",
    MEETING_COLLABORATION_WEBSOCKET_URL:
      origin.replace("https:", "wss:") + "/meeting-collaboration",
    NAVIGATION_REALTIME_WEBSOCKET_URL: origin.replace("https:", "wss:") + "/navigation-realtime",
  };
}
