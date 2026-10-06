import { expect, it, vi } from "vitest";
import {
  purgeCloudflareCellQueues,
  CLOUDFLARE_CELL_QUEUE_NAMES,
} from "./cloudflare-queue-operations";
const ids = Object.fromEntries(
  CLOUDFLARE_CELL_QUEUE_NAMES.map((name, index) => [
    name,
    (index + 1).toString(16).padStart(32, "0"),
  ]),
);
const env = {
  ZILOBASE_CELL_ID: "cell",
  CLOUDFLARE_BACKGROUND_QUEUE_CELL_ID: "cell",
  CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
  CLOUDFLARE_API_TOKEN: "test-token",
  CLOUDFLARE_BACKGROUND_QUEUE_IDS: JSON.stringify(ids),
};
it("validates every queue before purging and confirms all eight purges", async () => {
  const request = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url).split("/");
    const purge = path.at(-1) === "purge";
    const id = path.at(purge ? -2 : -1);
    const name = CLOUDFLARE_CELL_QUEUE_NAMES.find((name) => ids[name] === id);
    return Response.json({
      success: true,
      result: purge
        ? { started_at: new Date().toISOString(), completed: new Date().toISOString() }
        : { queue_name: name },
    });
  });
  const result = await purgeCloudflareCellQueues(env, "cell", request);
  expect(result.purged).toHaveLength(8);
  const calls = request.mock.calls;
  expect(calls.slice(0, 8).every(([, init]) => init?.method === "GET")).toBe(true);
  expect(calls.filter(([, init]) => init?.method === "POST")).toHaveLength(8);
});
it("refuses a mismatched cell or inventory before destructive requests", async () => {
  const request = vi.fn(async () =>
    Response.json({ success: true, result: { queue_name: "unrelated" } }),
  );
  await expect(purgeCloudflareCellQueues(env, "other", request)).rejects.toThrow("CELL_MISMATCH");
  expect(request).not.toHaveBeenCalled();
  await expect(purgeCloudflareCellQueues(env, "cell", request)).rejects.toThrow(
    "INVENTORY_MISMATCH",
  );
  expect(request.mock.calls).toHaveLength(1);
});
