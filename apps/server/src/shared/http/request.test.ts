import { describe, expect, it } from "vitest";

import { readJsonBody, requestSignal } from "./request";

describe("JSON request parsing", () => {
  it("returns an explicit fallback for malformed request bodies", async () => {
    const request = { json: () => Promise.reject(new SyntaxError("invalid JSON")) };

    await expect(readJsonBody(request)).resolves.toBeNull();
    await expect(readJsonBody(request, {})).resolves.toEqual({});
  });

  it("returns unknown input for route-local schema validation", async () => {
    const body = await readJsonBody({
      json: () => Promise.resolve({ name: "Inbox" }),
    });

    expect(body).toEqual({ name: "Inbox" });
  });
});

describe("requestSignal", () => {
  it("propagates caller cancellation", () => {
    const controller = new AbortController();
    const signal = requestSignal(1_000, controller.signal);

    controller.abort("cancelled");

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe("cancelled");
  });

  it("rejects invalid timeout values", () => {
    expect(() => requestSignal(0)).toThrow(RangeError);
    expect(() => requestSignal(1.5)).toThrow(RangeError);
  });
});
