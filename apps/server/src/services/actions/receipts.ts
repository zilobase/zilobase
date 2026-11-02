/*
 * Action receipts make repeated deliveries of the same invocation safe. Each
 * operation of a call is keyed by its position; its exact request is stored
 * before execution and its acknowledgement after, so a recovered worker sends
 * byte-identical requests (and receives the stored command receipts) instead
 * of issuing new writes.
 */

export type ActionReceiptKey = { invocationId: string; callId: string; opIndex: number };
export type ActionReceipt = {
  kind: "database" | "page";
  request: unknown;
  status: "pending" | "completed";
  result?: unknown;
};

export interface ActionReceiptStore {
  get(key: ActionReceiptKey): Promise<ActionReceipt | null>;
  savePending(
    key: ActionReceiptKey,
    receipt: Pick<ActionReceipt, "kind" | "request">,
  ): Promise<void>;
  complete(key: ActionReceiptKey, result: unknown): Promise<void>;
}

export function memoryReceiptStore(): ActionReceiptStore & { entries: Map<string, ActionReceipt> } {
  const entries = new Map<string, ActionReceipt>();
  const id = (key: ActionReceiptKey) => `${key.invocationId}:${key.callId}:${key.opIndex}`;
  return {
    entries,
    async get(key) {
      return entries.get(id(key)) ?? null;
    },
    async savePending(key, receipt) {
      if (!entries.has(id(key))) entries.set(id(key), { ...receipt, status: "pending" });
    },
    async complete(key, result) {
      const current = entries.get(id(key));
      if (current) entries.set(id(key), { ...current, status: "completed", result });
    },
  };
}

/** A deterministic, RFC 4122-formatted (version 8) identifier for an operation of a call. */
export async function deterministicActionId(...parts: string[]) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join("\u0000"))),
  ).slice(0, 16);
  digest[6] = (digest[6]! & 0x0f) | 0x80;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
