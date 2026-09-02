import assert from "node:assert/strict";
import { test } from "vitest";

import {
  getCanonicalApiOrigin,
  getCanonicalHttpOrigin,
  getCanonicalWebOrigin,
  getClientOrigins,
  getPrimaryClientOrigin,
  getRequiredStringEnv,
  getStringEnv,
  getTrustedOrigins,
  isAllowedClientOrigin,
  isLocalDevelopmentHost,
  isLocalRequestOrigin,
  isLoopbackHost,
  isMailFeatureEnabled,
  isAutomationWebhooksEnabled,
  isAutomationSlackEnabled,
  getAutomationWebhookHttpDomains,
  getDatabaseAutomationRetention,
  isDatabaseAutomationExecutionEnabled,
  resolvePublicRequestUrl,
} from "./config";

test("mail is disabled unless explicitly enabled", () => {
  assert.equal(isMailFeatureEnabled({}), false);
  assert.equal(isMailFeatureEnabled({ MAIL_ENABLED: "false" }), false);
  assert.equal(isMailFeatureEnabled({ MAIL_ENABLED: "TRUE" }), true);
});

test("automation webhooks and self-hosted HTTP domains are explicit", () => {
  assert.equal(isAutomationWebhooksEnabled({}), false);
  assert.equal(isAutomationWebhooksEnabled({ AUTOMATION_WEBHOOKS_ENABLED: "TRUE" }), true);
  assert.deepEqual(
    [...getAutomationWebhookHttpDomains({ AUTOMATION_WEBHOOK_HTTP_DOMAINS: " hooks.example.test,local.example.test " })],
    ["hooks.example.test", "local.example.test"],
  );
});

test("automation Slack is disabled unless explicitly enabled", () => {
  assert.equal(isAutomationSlackEnabled({}), false);
  assert.equal(isAutomationSlackEnabled({ AUTOMATION_SLACK_ENABLED: "true" }), true);
});

test("automation execution kill switch and retention defaults are operator-owned", () => {
  assert.equal(isDatabaseAutomationExecutionEnabled({}), true);
  assert.equal(isDatabaseAutomationExecutionEnabled({ DATABASE_AUTOMATIONS_EXECUTION_DISABLED: "TRUE" }), false);
  assert.deepEqual(getDatabaseAutomationRetention({}), { runSummaryDays: 30, stepDetailDays: 7 });
  assert.deepEqual(getDatabaseAutomationRetention({
    DATABASE_AUTOMATION_RUN_RETENTION_DAYS: "999",
    DATABASE_AUTOMATION_STEP_RETENTION_DAYS: "0",
  }), { runSummaryDays: 365, stepDetailDays: 1 });
});

test("public request URLs prefer the local Host over a rewritten production origin", () => {
  const request = new Request(
    "https://api.zilobase.com/desktop/authorize?client_id=zilobase-desktop",
    { headers: { host: "localhost:3000" } },
  );

  assert.equal(
    resolvePublicRequestUrl(request).href,
    "http://localhost:3000/desktop/authorize?client_id=zilobase-desktop",
  );
  assert.equal(
    resolvePublicRequestUrl(
      new Request(
        "https://api.zilobase.com/desktop/authorize?client_id=zilobase-desktop",
        { headers: { host: "api.zilobase.com" } },
      ),
      {
        BETTER_AUTH_URL: "http://localhost:3000",
        ZILOBASE_ADAPTER_PORT: "3000",
      },
    ).href,
    "http://localhost:3000/desktop/authorize?client_id=zilobase-desktop",
  );
  assert.equal(
    resolvePublicRequestUrl(
      new Request(
        "https://api.zilobase.com/desktop/authorize?client_id=zilobase-desktop",
        { headers: { host: "api.zilobase.com" } },
      ),
      {
        BETTER_AUTH_URL: "https://api.zilobase.com",
        ZILOBASE_ADAPTER_PORT: "3000",
      },
    ).href,
    "https://api.zilobase.com/desktop/authorize?client_id=zilobase-desktop",
  );
});

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

test("canonical public origins are normalized and reject unsafe URL components", () => {
  const env = {
    BETTER_AUTH_URL: "https://API.Example.com:443/",
    CLIENT_URL: "https://app.example.com/,tauri://localhost",
  };

  assert.equal(getCanonicalApiOrigin(env), "https://api.example.com");
  assert.equal(getCanonicalWebOrigin(env), "https://app.example.com");
  assert.equal(
    getCanonicalHttpOrigin("http://127.0.0.1:8787/"),
    "http://127.0.0.1:8787",
  );

  for (const origin of [
    "http://example.com",
    "https://user:password@example.com",
    "https://example.com/subpath",
    "https://example.com?server=other",
    "https://example.com#fragment",
    "tauri://localhost",
    "not a URL",
  ]) {
    assert.throws(() => getCanonicalHttpOrigin(origin), Error, origin);
  }
});

test("allowed origins include configured clients and local Expo development", () => {
  const env = { CLIENT_URL: "https://app.example.com" };

  assert.equal(isAllowedClientOrigin(env, null), false);
  assert.equal(isAllowedClientOrigin(env, "https://app.example.com"), true);
  assert.equal(isAllowedClientOrigin(env, "tauri://localhost"), true);
  assert.equal(isAllowedClientOrigin(env, "http://tauri.localhost"), true);
  assert.equal(isAllowedClientOrigin(env, "tauri://attacker"), false);
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
    "tauri://localhost",
    "http://tauri.localhost",
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

  assert.equal(isLoopbackHost("localhost"), true);
  assert.equal(isLoopbackHost("127.0.0.1"), true);
  assert.equal(isLoopbackHost("::1"), true);
  assert.equal(isLoopbackHost("192.168.1.2"), false);
});

test("string environment helpers reject empty and non-string values", () => {
  assert.equal(getStringEnv({ VALUE: "configured" }, "VALUE"), "configured");
  assert.equal(getStringEnv({ VALUE: "" }, "VALUE"), undefined);
  assert.equal(getStringEnv({ VALUE: 123 }, "VALUE"), undefined);
  assert.equal(getRequiredStringEnv({ VALUE: "configured" }, "VALUE"), "configured");
  assert.throws(() => getRequiredStringEnv({}, "VALUE"), /VALUE is required/);
});
