import { emitCalendarMetric } from "../metrics";
import { calendarRecoveryDelay, calendarPushHealthy, validCalendarInvalidation } from "./recovery-model";
import { calendarApiBasePath } from "@zilobase/features/calendar";
import { apiFetch } from "@/platform/network/api";
import type { CalendarDatabase } from "../storage/calendar-database";
type Refresh = (recover: boolean) => Promise<unknown>;
const coordinators = new Map<string, { subscribers: Set<Refresh>; stop: () => void }>();
export function startCalendarRecovery(database: CalendarDatabase, refresh: Refresh, isOnline: () => boolean) {
  let coordinator = coordinators.get(database.name);
  if (!coordinator) {
    const subscribers = new Set<Refresh>();
    const stop = createCalendarRecovery(database, async provider => {
      const outcomes = await Promise.allSettled([...subscribers].map(subscriber => subscriber(provider)));
      return outcomes.every(outcome => outcome.status === "fulfilled" && Boolean(outcome.value));
    }, isOnline);
    coordinator = { subscribers, stop }; coordinators.set(database.name, coordinator);
  }
  coordinator.subscribers.add(refresh);
  return () => { coordinator.subscribers.delete(refresh); if (!coordinator.subscribers.size) { coordinator.stop(); coordinators.delete(database.name); } };
}
function createCalendarRecovery(database: CalendarDatabase, refresh: Refresh, isOnline: () => boolean) {
  const scope = database.identity, abort = new AbortController();
  const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(`${database.name}:realtime`);
  let watchExpiresAt = 0;
  let stopped = false, socket: WebSocket | null = null, leader = false, lastPong = 0, failures = 0, reconnectAttempt = 0;
  let heartbeat: ReturnType<typeof setInterval> | undefined, reconnect: ReturnType<typeof setTimeout> | undefined, polling: ReturnType<typeof setTimeout> | undefined;
  const socketHealthy = () => lastPong > 0 && Date.now() - lastPong < 45_000;
  const healthy = () => calendarPushHealthy(lastPong, watchExpiresAt);
  const recover = async (provider: boolean) => { if (!stopped && isOnline() && document.visibilityState !== "hidden") { const ok = await refresh(provider); failures = ok ? 0 : failures + 1 } };
  const invalidation = async (data: unknown) => {
    if (!validCalendarInvalidation(data, scope) || !database.isOpen()) return;
    const prior = await database.state.get(data.calendarId);
    if (prior && (prior.generation > data.generation || (prior.generation === data.generation && prior.revision > data.revision))) return;
    await database.state.put({ key: data.calendarId, generation: data.generation, revision: data.revision });
    await recover(false);
  };
  channel && (channel.onmessage = event => {
    if (event.data?.type === "calendar.health") { lastPong = Date.now(); watchExpiresAt = typeof event.data.watchExpiresAt === "number" ? event.data.watchExpiresAt : 0; }
    else if (event.data?.type === "calendar.recover") void recover(false);
    else void invalidation(event.data);
  });
  const receivedHealth = (type: string) => { lastPong = Date.now(); reconnectAttempt = 0; channel?.postMessage({ type: "calendar.health", watchExpiresAt }); if (type === "calendar.ready") void recover(true) };
  const connect = async () => {
    if (stopped || !leader || !isOnline()) return;
    try {
      const ticket = await apiFetch<{ websocketUrl: string; websocketProtocols: string[]; expiresAt: string; providerWatchExpiresAt: string | null }>(`${calendarApiBasePath(scope.workspaceId)}/connections/${encodeURIComponent(scope.bindingId)}/realtime-ticket`, { method: "POST" });
      if (stopped || !leader) return;
      watchExpiresAt = Date.parse(ticket.providerWatchExpiresAt ?? "") || 0;
      attachCalendarSocket(ticket, () => ({ stopped, socket, leader }), next => { socket = next; }, receivedHealth, invalidation, scope, channel, () => { lastPong = 0; scheduleReconnect(); }, socketHealthy, interval => { heartbeat = interval; }, heartbeat);
    } catch { scheduleReconnect() }
  };
  function scheduleReconnect() {
    if (stopped || !leader) return;
    emitCalendarMetric("reconnect", 1);
    if (reconnect) clearTimeout(reconnect);
    reconnect = setTimeout(() => void connect(), Math.min(30_000, 1000 * 2 ** Math.min(reconnectAttempt++, 5)) * (0.8 + Math.random() * 0.2));
  }
  const poll = async () => { await recover(true); if (!stopped) polling = setTimeout(() => void poll(), calendarRecoveryDelay(healthy(), failures)) };
  const wake = () => { if (isOnline()) { void recover(true); if (leader && !socket) void connect() } };
  window.addEventListener("focus", wake); window.addEventListener("online", wake); document.addEventListener("visibilitychange", wake);
  const runLeader = async () => {
    if (stopped) return; leader = true; void connect();
    await new Promise<void>(resolve => { if (abort.signal.aborted) resolve(); else abort.signal.addEventListener("abort", () => resolve(), { once: true }) });
    leader = false;
  };
  if (navigator.locks) void navigator.locks.request(`${database.name}:socket`, { signal: abort.signal }, runLeader).catch(() => {});
  else void runLeader();
  polling = setTimeout(() => void poll(), calendarRecoveryDelay(false));
  return () => { stopped = true; abort.abort(); socket?.close(); channel?.close(); clearInterval(heartbeat); clearTimeout(reconnect); clearTimeout(polling); window.removeEventListener("focus", wake); window.removeEventListener("online", wake); document.removeEventListener("visibilitychange", wake) };
}

function decodeMessage(data: unknown): { type?: string } | null { if (typeof data !== "string" || data.length > 4096) return null; try { const value: unknown = JSON.parse(data); return value && typeof value === "object" ? value : null } catch { return null } }
function attachCalendarSocket(
  ticket: { websocketUrl: string; websocketProtocols: string[]; expiresAt: string },
  state: () => { stopped: boolean; socket: WebSocket | null; leader: boolean },
  setSocket: (ws: WebSocket | null) => void,
  receivedHealth: (type: string) => void,
  invalidation: (value: unknown) => Promise<void>,
  scope: CalendarDatabase["identity"],
  channel: BroadcastChannel | null,
  onClose: () => void,
  socketHealthy: () => boolean,
  setHeartbeat: (value: ReturnType<typeof setInterval>) => void,
  heartbeat?: ReturnType<typeof setInterval>,
) {
  const ws = new WebSocket(ticket.websocketUrl, ticket.websocketProtocols);
  setSocket(ws);
  ws.onmessage = event => handleCalendarSocketMessage(event.data, () => state().stopped || state().socket !== ws, receivedHealth, value => { channel?.postMessage(value); void invalidation(value); }, scope);
  ws.onclose = () => { if (state().socket === ws) setSocket(null); onClose(); };
  ws.onerror = () => ws.close();
  if (heartbeat) clearInterval(heartbeat);
  setHeartbeat(setInterval(() => pingCalendarSocket(ws, ticket.expiresAt, state, socketHealthy), 20_000));
  return ws;
}
function pingCalendarSocket(ws: WebSocket, expiresAt: string, state: () => { stopped: boolean; socket: WebSocket | null }, socketHealthy: () => boolean) {
  if (state().stopped || state().socket !== ws) return;
  if (Date.now() >= Date.parse(expiresAt) - 30_000 || !socketHealthy()) { ws.close(); return; }
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "calendar.ping" }));
}
function handleCalendarSocketMessage(data: unknown, ignore: () => boolean, receivedHealth: (type: string) => void, onInvalidate: (value: unknown) => void, scope: CalendarDatabase["identity"]) {
  if (ignore()) return;
  const value = decodeMessage(data); if (!value) return;
  if (value.type === "calendar.ready" || value.type === "calendar.pong") receivedHealth(value.type);
  else if (validCalendarInvalidation(value, scope)) onInvalidate(value);
}
