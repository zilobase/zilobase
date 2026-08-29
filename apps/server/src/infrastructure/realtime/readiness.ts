import { getStringEnv, type RuntimeEnv } from "../../shared/config/config";

let readinessProbe: (() => boolean) | null = null;

export function setRealtimeReadinessProbe(probe: (() => boolean) | null) {
  readinessProbe = probe;
}

export function isRealtimeReady(env: RuntimeEnv) {
  if (!getStringEnv(env, "REALTIME_REDIS_URL")) return true;
  return readinessProbe?.() ?? false;
}
