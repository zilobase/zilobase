import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import * as z from "zod";

import type { AppBindings } from "../types";
import { jsonContentTypeHeaders, jsonValidator } from "./json";

const schema = z.object({ name: z.string().min(1) });

function app() {
  const application = new Hono<AppBindings>();
  application.post("/named", jsonValidator(schema), (c) => c.json(c.req.valid("json"), 201));
  application.post("/any", jsonValidator(), (c) => c.json(c.req.valid("json")));
  return application;
}

describe("jsonValidator", () => {
  it("rejects missing content-type instead of parsing an empty object", async () => {
    const response = await app().request("/named", {
      method: "POST",
      body: JSON.stringify({ name: "Inbox" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "A JSON body is required" });
  });

  it("returns schema issues for invalid JSON objects", async () => {
    const response = await app().request("/named", {
      method: "POST",
      headers: jsonContentTypeHeaders(),
      body: JSON.stringify({ name: "" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      error: "Invalid request body",
    });
  });

  it("exposes validated JSON to the handler", async () => {
    const response = await app().request("/named", {
      method: "POST",
      headers: jsonContentTypeHeaders(),
      body: JSON.stringify({ name: "Inbox" }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ name: "Inbox" });
  });

  it("still accepts JSON arrays when no schema is provided", async () => {
    const response = await app().request("/any", {
      method: "POST",
      headers: jsonContentTypeHeaders(),
      body: JSON.stringify([{ id: "1" }]),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: "1" }]);
  });
});
