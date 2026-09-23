import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../../../infrastructure/database";
import { calendarAccount, calendarBinding, calendarOauthAttempt } from "../../../infrastructure/database/schema";
import { getRequiredStringEnv, getCanonicalApiOrigin, type RuntimeEnv } from "../../../shared/config/config";
import { sha256Hex } from "../../../shared/crypto/sha256";
import { verifyGoogleIdToken } from "../../../shared/security/google-id-token";
import { encryptCalendarSecret, decryptCalendarSecret } from "./credentials";
import { requireCalendarMembership } from "../connections/ownership";
import { CalendarGateway, CalendarProviderError } from "./gateway";
export const CALENDAR_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.calendarlist", "https://www.googleapis.com/auth/calendar.calendars.readonly"];
function client(env: RuntimeEnv) { return { client_id: getRequiredStringEnv(env, "CALENDAR_GOOGLE_CLIENT_ID"), client_secret: getRequiredStringEnv(env, "CALENDAR_GOOGLE_CLIENT_SECRET") } }
function redirectUri(env: RuntimeEnv) { return new URL("/calendar/oauth/google/callback", getCanonicalApiOrigin(env)).toString() }
export async function beginCalendarOAuth(env: RuntimeEnv, input: { userId: string; workspaceId: string; clientKind: "web" | "desktop" }) {
  const state = crypto.randomUUID() + crypto.randomUUID(), verifier = crypto.randomUUID() + crypto.randomUUID(), id = crypto.randomUUID();
  const challenge = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).toString("base64url");
  const secret = await encryptCalendarSecret(env, verifier, { connectionId: id, purpose: "oauth_verifier", userId: input.userId });
  await db.insert(calendarOauthAttempt).values({ id, ...input, stateHash: await sha256Hex(state), verifier: secret, expiresAt: new Date(Date.now() + 600_000) });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: client(env).client_id, redirect_uri: redirectUri(env), response_type: "code", scope: CALENDAR_SCOPES.join(" "), state, code_challenge: challenge, code_challenge_method: "S256", access_type: "offline", prompt: "consent select_account" }).toString();
  return url.toString();
}
export async function consumeCalendarOAuthAttempt(state: string) {
  const [attempt] = await db.update(calendarOauthAttempt).set({ consumedAt: new Date() }).where(and(eq(calendarOauthAttempt.stateHash, await sha256Hex(state)), isNull(calendarOauthAttempt.consumedAt), gt(calendarOauthAttempt.expiresAt, new Date()))).returning();
  if (!attempt) throw new CalendarProviderError(400, "expired_oauth_attempt");
  await requireCalendarMembership(attempt.userId, attempt.workspaceId);
  return attempt;
}
export async function completeCalendarOAuth(env: RuntimeEnv, state: string, code: string) {
  const attempt = await consumeCalendarOAuthAttempt(state);
  const verifier = await decryptCalendarSecret(env, attempt.verifier, { connectionId: attempt.id, userId: attempt.userId, purpose: "oauth_verifier" });
  const token = await exchange(env, { grant_type: "authorization_code", code, redirect_uri: redirectUri(env), code_verifier: verifier });
  if (!token.id_token || !token.refresh_token) throw new CalendarProviderError(400, "missing_google_consent");
  const scopes = (token.scope ?? "").split(" ");
  if (CALENDAR_SCOPES.filter(s => s.startsWith("https://")).some(s => !scopes.includes(s))) throw new CalendarProviderError(400, "missing_calendar_scopes");
  const identity = await verifyGoogleIdToken(token.id_token, client(env).client_id);
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`calendar:${attempt.userId}`}))`);
    const [existing] = await tx.select().from(calendarAccount).where(and(eq(calendarAccount.userId, attempt.userId), eq(calendarAccount.googleSubject, identity.subject)));
    const accountId = existing?.id ?? crypto.randomUUID();
    const secret = await encryptCalendarSecret(env, token.refresh_token!, { connectionId: accountId, purpose: "refresh_token", userId: attempt.userId });
    await tx.insert(calendarAccount).values({ id: accountId, userId: attempt.userId, googleSubject: identity.subject, email: identity.email, secret, scopes }).onConflictDoUpdate({ target: [calendarAccount.userId, calendarAccount.googleSubject], set: { secret, scopes, email: identity.email, status: "connected" } });
    await tx.insert(calendarBinding).values({ id: crypto.randomUUID(), userId: attempt.userId, workspaceId: attempt.workspaceId, accountId }).onConflictDoNothing();
  });
  return attempt;
}
type Token = { access_token?: string; refresh_token?: string; id_token?: string; scope?: string; error?: string };
async function exchange(env: RuntimeEnv, body: Record<string, string>): Promise<Token> {
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ ...client(env), ...body }), signal: AbortSignal.timeout(20_000) });
  const token = await response.json() as Token;
  if (!response.ok || !token.access_token) throw new CalendarProviderError(response.status === 400 ? 401 : 502, token.error === "invalid_grant" ? "authorization_revoked" : "token_exchange_failed");
  return token;
}
export async function createCalendarGateway(env: RuntimeEnv, account: typeof calendarAccount.$inferSelect) {
  const refresh = await decryptCalendarSecret(env, account.secret, { connectionId: account.id, userId: account.userId, purpose: "refresh_token" });
  try {
    const token = await exchange(env, { grant_type: "refresh_token", refresh_token: refresh });
    return new CalendarGateway(token.access_token!);
  } catch (error) {
    if (error instanceof CalendarProviderError && error.code === "authorization_revoked") await db.update(calendarAccount).set({ status: "reconnect_required" }).where(eq(calendarAccount.id, account.id));
    throw error;
  }
}
