export const MAX_DATABASE_REALTIME_MESSAGE_BYTES = 16 * 1024;

export type DatabasePresence = {
  columnKey: string;
  rowId: string;
  viewId: string | null;
};

export function validateDatabaseRealtimeMessage(
  rawMessage: string | ArrayBuffer,
) {
  if (typeof rawMessage !== "string") {
    return { code: 1003, ok: false as const, reason: "JSON messages are required" };
  }
  if (new TextEncoder().encode(rawMessage).byteLength > MAX_DATABASE_REALTIME_MESSAGE_BYTES) {
    return { code: 1009, ok: false as const, reason: "Database realtime message is too large" };
  }
  try {
    const value = JSON.parse(rawMessage) as unknown;
    return value && typeof value === "object"
      ? { message: value as Record<string, unknown>, ok: true as const }
      : { code: 1007, ok: false as const, reason: "Invalid JSON message" };
  } catch {
    return { code: 1007, ok: false as const, reason: "Invalid JSON message" };
  }
}

export function isDatabasePresence(value: unknown): value is DatabasePresence {
  if (!value || typeof value !== "object") return false;
  const presence = value as Record<string, unknown>;
  return typeof presence.columnKey === "string" && presence.columnKey.length > 0 &&
    presence.columnKey.length <= 128 && typeof presence.rowId === "string" &&
    presence.rowId.length > 0 && presence.rowId.length <= 128 &&
    (presence.viewId === null ||
      (typeof presence.viewId === "string" && presence.viewId.length <= 128));
}

export function toDatabaseCollaborator<User>(attachment: {
  claims: { sessionId: string; user: User };
  connectedAt: number;
  presence?: DatabasePresence;
  updatedAt?: number;
}) {
  if (!attachment.presence) throw new Error("Cannot serialize empty database presence");
  return {
    connectedAt: new Date(attachment.connectedAt).toISOString(),
    presence: attachment.presence,
    sessionId: attachment.claims.sessionId,
    updatedAt: new Date(attachment.updatedAt ?? Date.now()).toISOString(),
    user: attachment.claims.user,
  };
}

export function consumeDatabaseMessageAllowance<Peer extends object>(
  peer: Peer,
  rates: WeakMap<Peer, { count: number; startedAt: number }>,
  now = Date.now(),
) {
  const current = rates.get(peer);
  if (!current || now - current.startedAt >= 1_000) {
    rates.set(peer, { count: 1, startedAt: now });
    return true;
  }
  current.count += 1;
  return current.count <= 30;
}
