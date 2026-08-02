import assert from "node:assert/strict";
import { test } from "vitest";

import {
  getClientOrigins,
  getPrimaryClientOrigin,
  getRequiredStringEnv,
  getStringEnv,
  getTrustedOrigins,
  isAllowedClientOrigin,
  isLocalDevelopmentHost,
  isLocalRequestOrigin,
} from "./config";

test("client origins are normalized, selected, and required", () => {
  const env = {
    CLIENT_URL: " https://app.example.com, ,https://admin.example.com ",
  };

  assert.deepEqual(getClientOrigins(env), [
    "https://app.example.com",
    "https://admin.example.com",
  ]);
  assert.equal(getPrimaryClientOrigin(env), "https://app.example.com");
  assert.throws(() => getClientOrigins({}), /CLIENT_URL is required/);
  assert.throws(
    () => getPrimaryClientOrigin({ CLIENT_URL: " , " }),
    /must include at least one origin/,
  );
});

test("allowed origins include configured clients and local Expo development", () => {
  const env = { CLIENT_URL: "https://app.example.com" };

  assert.equal(isAllowedClientOrigin(env, null), false);
  assert.equal(isAllowedClientOrigin(env, "https://app.example.com"), true);
  assert.equal(isAllowedClientOrigin(env, "not a URL"), false);
  assert.equal(isAllowedClientOrigin(env, "exp://localhost:8081"), true);
  assert.equal(isAllowedClientOrigin(env, "exps://192.168.1.3"), true);
  assert.equal(isAllowedClientOrigin(env, "exp://public.example.com"), false);
  assert.equal(isAllowedClientOrigin(env, "https://localhost"), false);
});

test("trusted origins add development clients only for local requests", () => {
  const env = {
    CLIENT_URL: "https://app.example.com,https://app.example.com",
  };
  const production = getTrustedOrigins(env, "https://api.example.com");
  const development = getTrustedOrigins(env, "http://localhost:3000");

  assert.deepEqual(production, [
    "https://api.example.com",
    "https://app.example.com",
    "mobile://",
    "mobile://*",
  ]);
  assert.ok(development.includes("exp://**"));
  assert.ok(development.includes("http://127.0.0.1:5173"));
  assert.equal(isLocalRequestOrigin(null), false);
  assert.equal(isLocalRequestOrigin(new URL("http://10.0.0.2")), true);
});

test("local host classification covers loopback and private IPv4 ranges", () => {
  for (const hostname of [
    "localhost",
    "0.0.0.0",
    "192.0.0.2",
    "127.0.0.1",
    "::1",
    "10.2.3.4",
    "192.168.2.3",
    "172.16.0.1",
    "172.31.255.255",
  ]) {
    assert.equal(isLocalDevelopmentHost(hostname), true, hostname);
  }

  for (const hostname of [
    "example.com",
    "172.15.0.1",
    "172.32.0.1",
    "192.167.1.1",
  ]) {
    assert.equal(isLocalDevelopmentHost(hostname), false, hostname);
  }
});

test("string environment helpers reject empty and non-string values", () => {
  assert.equal(getStringEnv({ VALUE: "configured" }, "VALUE"), "configured");
  assert.equal(getStringEnv({ VALUE: "" }, "VALUE"), undefined);
  assert.equal(getStringEnv({ VALUE: 123 }, "VALUE"), undefined);
  assert.equal(getRequiredStringEnv({ VALUE: "configured" }, "VALUE"), "configured");
  assert.throws(() => getRequiredStringEnv({}, "VALUE"), /VALUE is required/);
});
