import { afterEach, describe, expect, it, vi } from "vitest";

import { createWorkerDatabaseUnavailableResponse } from "./request-error";

afterEach(() => vi.restoreAllMocks());

describe("Worker request errors", () => {
  it("returns a recoverable response for a refused database connection", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const nested = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), {
      code: "ECONNREFUSED",
    });
    const error = new AggregateError([nested], "database connection failed");
    const response = createWorkerDatabaseUnavailableResponse(
      error,
      new Request("https://api.example.com/collaboration", {
        headers: { "x-zilobase-request-id": "request-1" },
      }),
    );

    expect(response?.status).toBe(503);
    expect(response?.headers.get("retry-after")).toBe("5");
    expect(response?.headers.get("x-zilobase-request-id")).toBe("request-1");
    await expect(response?.json()).resolves.toEqual({
      code: "DATABASE_UNAVAILABLE",
      message: "The database is temporarily unavailable.",
    });
    expect(log).toHaveBeenCalledWith(expect.stringContaining(
      '"event":"database_connection_failed"',
    ));
  });

  it("does not hide unrelated Worker failures", () => {
    expect(createWorkerDatabaseUnavailableResponse(
      new Error("unexpected"),
      new Request("https://api.example.com/collaboration"),
    )).toBeNull();
  });
});
