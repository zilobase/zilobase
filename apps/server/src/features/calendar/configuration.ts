import { Buffer } from "node:buffer";
import { getStringEnv, type RuntimeEnv } from "../../shared/config/config";
export function inspectCalendarConfiguration(env: RuntimeEnv, capabilities: { background: boolean; realtime: boolean }) {
  const checks = {
    oauth: Boolean(getStringEnv(env, "CALENDAR_GOOGLE_CLIENT_ID") && getStringEnv(env, "CALENDAR_GOOGLE_CLIENT_SECRET")),
    encryption: encryptionConfigured(getStringEnv(env, "CALENDAR_TOKEN_ENCRYPTION_KEY")),
    webhook: httpsUrl(getStringEnv(env, "CALENDAR_WEBHOOK_URL")),
    callback: callbackConfigured(getStringEnv(env, "BETTER_AUTH_URL")),
    background: capabilities.background,
    realtime: capabilities.realtime,
  };
  return { checks, ready: Object.values(checks).every(Boolean) };
}
function encryptionConfigured(value?: string) { return Boolean(value && /^[A-Za-z0-9+/]+={0,2}$/.test(value) && Buffer.from(value, "base64").length === 32) }
function httpsUrl(value?: string) { try { return new URL(value!).protocol === "https:" } catch { return false } }
function callbackConfigured(value?: string) { try { const url = new URL(value!); return url.protocol === "https:" || ["localhost", "127.0.0.1"].includes(url.hostname) } catch { return false } }
