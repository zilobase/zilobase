import { recordCalendarMetric } from "../metrics";
import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../../../infrastructure/database";
import { calendarAccount, calendarBinding, calendarWatchChannel, calendarProviderCalendar } from "../../../infrastructure/database/schema";
import { getStringEnv, type RuntimeEnv } from "../../../shared/config/config";
import { sha256Hex } from "../../../shared/crypto/sha256";
import { CalendarGateway, CalendarProviderError } from "../provider/gateway";
import { createCalendarGateway } from "../provider/oauth";
import { refreshCalendarList } from "../sync/sync";
function webhookChannelHeaders(headers: Headers) {
  const id = headers.get("x-goog-channel-id"), token = headers.get("x-goog-channel-token"), resourceId = headers.get("x-goog-resource-id"), number = headers.get("x-goog-message-number");
  if (!id || !token || !resourceId || !number || !/^\d{1,30}$/.test(number) || token.length > 512 || resourceId.length > 1024) return null;
  return { id, token, resourceId, number };
}
export async function acceptCalendarWebhook(headers: Headers, dispatch?: (accountId: string, calendarId: string | null) => Promise<void>) {
  const channel = webhookChannelHeaders(headers);
  if (!channel) return false;
  const { id, token, resourceId, number } = channel;
  const accepted = await db.transaction(async tx => {
    const [channel] = await tx.select().from(calendarWatchChannel).where(and(eq(calendarWatchChannel.id, id), gt(calendarWatchChannel.expiresAt, new Date()))).for("update");
    if (!channel || channel.tokenHash !== await sha256Hex(token) || (channel.resourceId && channel.resourceId !== resourceId)) return false;
    if (BigInt(number) <= BigInt(channel.messageNumber)) return { accountId: channel.accountId, calendarId: channel.calendarId, changed: false };
    await tx.update(calendarWatchChannel).set({ resourceId, messageNumber: number, dirtyAt: new Date() }).where(eq(calendarWatchChannel.id, id));
    if (channel.calendarId) await tx.update(calendarProviderCalendar).set({ dirtyAt: new Date() }).where(and(eq(calendarProviderCalendar.accountId, channel.accountId), eq(calendarProviderCalendar.calendarId, channel.calendarId)));
    return { accountId: channel.accountId, calendarId: channel.calendarId, changed: true };
  });
  if (!accepted) return false;
  if (accepted.changed && dispatch) {
    try { await dispatch(accepted.accountId, accepted.calendarId); }
    catch { recordCalendarMetric("reconnect", 1, "failure"); /* Dirty markers survive dispatch failure for maintenance recovery. */ }
  }
  return true;
}
async function startWatch(accountId: string, calendarId: string | null, gateway: CalendarGateway, address: string) {
  const id = crypto.randomUUID(), token = crypto.randomUUID() + crypto.randomUUID();
  await db.insert(calendarWatchChannel).values({ id, accountId, calendarId, tokenHash: await sha256Hex(token), expiresAt: new Date(Date.now() + 600_000) });
  try {
    const result = await gateway.request<{ resourceId: string; expiration: string }>(calendarId ? `/calendars/${encodeURIComponent(calendarId)}/events/watch` : "/users/me/calendarList/watch", { method: "POST", body: JSON.stringify({ id, type: "web_hook", token, address, params: { ttl: "604800" } }) });
    const expiresAt = new Date(Number(result.expiration));
    if (!result.resourceId || !Number.isFinite(expiresAt.getTime())) throw new Error("Invalid watch registration");
    await db.update(calendarWatchChannel).set({ resourceId: result.resourceId, expiresAt, status: "active" }).where(and(eq(calendarWatchChannel.id, id), or(isNull(calendarWatchChannel.resourceId), eq(calendarWatchChannel.resourceId, result.resourceId))));
  } catch (error) {
    // Keep a short-lived pending registration: Google may have committed despite a lost response.
    if (error instanceof CalendarProviderError && [400, 401, 403].includes(error.status)) await db.delete(calendarWatchChannel).where(eq(calendarWatchChannel.id, id));
    throw error;
  }
}
export async function stopCalendarWatches(accountId: string, gateway: CalendarGateway) {
  for (const channel of await db.select().from(calendarWatchChannel).where(eq(calendarWatchChannel.accountId, accountId))) {
    if (channel.resourceId) try { await gateway.request("/channels/stop", { method: "POST", body: JSON.stringify({ id: channel.id, resourceId: channel.resourceId }) }) } catch (error) { if (!(error instanceof CalendarProviderError && [401, 403, 404, 410].includes(error.status))) throw error }
    await db.delete(calendarWatchChannel).where(eq(calendarWatchChannel.id, channel.id));
  }
}
export async function maintainCalendarWatches(env: RuntimeEnv) {
  const address = getStringEnv(env, "CALENDAR_WEBHOOK_URL");
  if (!address || new URL(address).protocol !== "https:") return;
  const accounts = await db.select().from(calendarAccount).where(eq(calendarAccount.status, "connected"));
  for (const account of accounts.slice(0, 100)) {
    try {
      await maintainAccountWatches(account, env, address);
    } catch { /* Durable registrations remain eligible for the next maintenance run. */ }
  }
  await db.delete(calendarWatchChannel).where(sql`${calendarWatchChannel.expiresAt} < now() - interval '1 day'`);
}

async function retireChannels(channels: (typeof calendarWatchChannel.$inferSelect)[], desired: (string | null)[], gateway: CalendarGateway) {
      for (const channel of channels) {
        recordCalendarMetric("watch_expiry", Math.max(0, channel.expiresAt.getTime() - Date.now()));
        const replacement = channels.some(c => c.id !== channel.id && c.calendarId === channel.calendarId && c.status === "active" && c.expiresAt > channel.expiresAt);
        if (!replacement && channel.expiresAt.getTime() > Date.now() && desired.includes(channel.calendarId)) continue;
        if (channel.resourceId) try { await gateway.request("/channels/stop", { method: "POST", body: JSON.stringify({ id: channel.id, resourceId: channel.resourceId }) }) } catch (error) { if (!(error instanceof CalendarProviderError && [404, 410].includes(error.status))) continue }
        await db.delete(calendarWatchChannel).where(eq(calendarWatchChannel.id, channel.id));
      }
}

export async function maintainAccountWatches(account: typeof calendarAccount.$inferSelect, env: RuntimeEnv, address: string) {
      const [binding] = await db.select().from(calendarBinding).where(eq(calendarBinding.accountId, account.id));
      if (!binding) return;
      let channels = await db.select().from(calendarWatchChannel).where(eq(calendarWatchChannel.accountId, account.id));
      let calendars = await db.select().from(calendarProviderCalendar).where(eq(calendarProviderCalendar.accountId, account.id));
      let desired = [null, ...calendars.filter(c => c.data.permissions.read && !c.data.permissions.freeBusyOnly).map(c => c.calendarId)];
      const listDirty = channels.find(c => c.calendarId === null && c.dirtyAt);
      if (!listDirty && desired.every(id => channels.some(c => c.calendarId === id && c.expiresAt.getTime() > Date.now() + 3600_000 && c.status === "active"))) return;
      const gateway = await createCalendarGateway(env, account);
      if (listDirty) {
        await refreshCalendarList(account.id, binding.id, gateway);
        calendars = await db.select().from(calendarProviderCalendar).where(eq(calendarProviderCalendar.accountId, account.id));
        desired = [null, ...calendars.filter(c => c.data.permissions.read && !c.data.permissions.freeBusyOnly).map(c => c.calendarId)];
        await db.update(calendarWatchChannel).set({ dirtyAt: null }).where(and(eq(calendarWatchChannel.accountId, account.id), isNull(calendarWatchChannel.calendarId), lte(calendarWatchChannel.dirtyAt, listDirty.dirtyAt!)));
      }
      for (const id of desired) if (!channels.some(c => c.calendarId === id && c.expiresAt.getTime() > Date.now() + (c.status === "pending" ? 0 : 3600_000))) await startWatch(account.id, id, gateway, address);
      channels = await db.select().from(calendarWatchChannel).where(eq(calendarWatchChannel.accountId, account.id));
      await retireChannels(channels, desired, gateway);
}
