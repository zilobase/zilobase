import { setTimeout as sleep } from "node:timers/promises";
const names = [
  "zilobase-background-fast",
  "zilobase-automation-runs",
  "zilobase-ai-jobs",
  "zilobase-calendar-jobs",
];
export const CLOUDFLARE_CELL_QUEUE_NAMES = [...names, ...names.map((name) => name + "-dlq")];

/** Uses the operator-provided inventory; never discovers or purges unrelated queues. */
export async function purgeCloudflareCellQueues(
  env: Record<string, unknown>,
  cellId: string,
  request: typeof fetch = fetch,
) {
  if (env.ZILOBASE_CELL_ID !== cellId || env.CLOUDFLARE_BACKGROUND_QUEUE_CELL_ID !== cellId)
    throw new Error("CLOUDFLARE_QUEUE_CELL_MISMATCH");
  const account = env.CLOUDFLARE_ACCOUNT_ID;
  const token = env.CLOUDFLARE_API_TOKEN;
  if (
    typeof account !== "string" ||
    !/^[a-f0-9]{32}$/i.test(account) ||
    typeof token !== "string" ||
    !token
  )
    throw new Error("CLOUDFLARE_QUEUE_OPERATIONS_CREDENTIALS_REQUIRED");
  const inventory: unknown = JSON.parse(String(env.CLOUDFLARE_BACKGROUND_QUEUE_IDS ?? "{}"));
  if (!inventory || typeof inventory !== "object" || Object.keys(inventory).length !== 8)
    throw new Error("CLOUDFLARE_QUEUE_INVENTORY_INVALID");
  const ids = inventory as Record<string, unknown>;
  if (
    !CLOUDFLARE_CELL_QUEUE_NAMES.every(
      (name) => typeof ids[name] === "string" && /^[a-f0-9]{32}$/i.test(String(ids[name])),
    ) ||
    new Set(Object.values(ids)).size !== 8
  )
    throw new Error("CLOUDFLARE_QUEUE_INVENTORY_INVALID");
  async function api(path: string, method = "GET", body?: string) {
    const response = await request(
      `https://api.cloudflare.com/client/v4/accounts/${account}/queues/${path}`,
      {
        method,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        ...(body ? { body } : {}),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const result = (await response.json()) as { success: boolean; result: Record<string, unknown> };
    if (!response.ok || !result.success) throw new Error("CLOUDFLARE_QUEUE_OPERATION_FAILED");
    return result.result;
  }
  // Validate all queue identities before the first destructive request.
  for (const name of CLOUDFLARE_CELL_QUEUE_NAMES)
    if ((await api(String(ids[name]))).queue_name !== name)
      throw new Error("CLOUDFLARE_QUEUE_INVENTORY_MISMATCH");
  for (const name of CLOUDFLARE_CELL_QUEUE_NAMES) {
    const started = Date.now();
    await api(`${ids[name]}/purge`, "POST", JSON.stringify({ delete_messages_permanently: true }));
    for (;;) {
      const state = await api(`${ids[name]}/purge`);
      if (
        typeof state.completed === "string" &&
        state.completed &&
        typeof state.started_at === "string" &&
        Date.parse(state.started_at) >= started - 5000
      )
        break;
      if (Date.now() - started > 60_000) throw new Error("CLOUDFLARE_QUEUE_PURGE_NOT_CONFIRMED");
      await sleep(1000);
    }
  }
  return { cellId, purged: CLOUDFLARE_CELL_QUEUE_NAMES };
}
