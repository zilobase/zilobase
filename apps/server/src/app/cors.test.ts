import assert from "node:assert/strict";
import { test } from "vitest";
import { Hono } from "hono";

import { createCorsMiddleware } from "./cors";
import type { AppBindings } from "../types";

function corsApp() {
  const app = new Hono<AppBindings>();
  app.use("*", createCorsMiddleware());
  app.get("/", (c) => c.text("ok"));
  return app;
}

test("production CORS allows configured origins and rejects others", async () => {
  const app = corsApp();
  const env = { CLIENT_URL: "https://app.example.com" };
  const allowed = await app.request(
    "https://api.example.com/",
    { headers: { origin: "https://app.example.com" } },
    env,
  );
  const rejected = await app.request(
    "https://api.example.com/",
    { headers: { origin: "https://attacker.example.com" } },
    env,
  );

  assert.equal(
    allowed.headers.get("access-control-allow-origin"),
    "https://app.example.com",
  );
  assert.equal(allowed.headers.get("access-control-allow-credentials"), "true");
  assert.match(
    allowed.headers.get("access-control-expose-headers") ?? "",
    /set-auth-token/i,
  );
  assert.equal(rejected.headers.has("access-control-allow-origin"), false);
});

test("production CORS allows only the exact desktop webview origins", async () => {
  const app = corsApp();
  const env = { CLIENT_URL: "https://app.example.com" };

  for (const origin of ["tauri://localhost", "http://tauri.localhost"]) {
    const response = await app.request(
      "https://api.example.com/",
      { headers: { origin } },
      env,
    );
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
  }

  const rejected = await app.request(
    "https://api.example.com/",
    { headers: { origin: "tauri://attacker" } },
    env,
  );
  assert.equal(rejected.headers.has("access-control-allow-origin"), false);
});

test("local servers reflect development origins", async () => {
  const response = await corsApp().request(
    "http://localhost:3000/",
    { headers: { origin: "http://192.168.1.4:5173" } },
    { CLIENT_URL: "https://app.example.com" },
  );

  assert.equal(
    response.headers.get("access-control-allow-origin"),
    "http://192.168.1.4:5173",
  );
});
