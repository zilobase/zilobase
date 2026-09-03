import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";

const readSources = async (...files: string[]) => (await Promise.all(
  files.map((file) => readFile(new URL(file, import.meta.url), "utf8")),
)).join("\n");

const readRunEngine = () => readSources(
  "./run-engine.ts",
  "./execution-context.ts",
  "./action-executor.ts",
  "./action-support.ts",
  "./gmail-action.ts",
  "./slack-action.ts",
  "./webhook-action.ts",
);

const readAutomationService = () => readSources(
  "./service.ts",
  "./read-service.ts",
  "./run-history-service.ts",
  "./validation-service.ts",
  "./lifecycle-service.ts",
  "./catalog-service.ts",
  "./service-support.ts",
);

test("run engine pins revisions, leases work, and receipts every action", async () => {
  const source = await readRunEngine();
  expect(source).toContain("databaseAutomationRun.revisionId");
  expect(source).toContain('eq(databaseAutomationRun.status, "running")');
  expect(source).toContain("databaseAutomationRun.leaseExpiresAt");
  expect(source).toContain(".for(\"update\", { skipLocked: true })");
  expect(source).toContain("idempotencyKey = `${runId}:${actionId}`");
  expect(source).toContain("stableActionSuffix(context.run.id, action.id)");
});

test("internal actions preserve authority, limits, and automation origin", async () => {
  const [engine, mutations, rows] = await Promise.all([
    readRunEngine(),
    readFile(new URL("./internal-mutations.ts", import.meta.url), "utf8"),
    readFile(new URL("../rows/service.ts", import.meta.url), "utf8"),
  ]);
  expect(engine).toContain('requireDataSourceAccess(');
  expect(engine).toContain('"AUTOMATION_ROW_LIMIT"');
  expect(engine).toContain('status: "error"');
  expect(mutations).toContain("input.rows.length > 1_000");
  expect(mutations).toContain('origin: "automation" as const');
  expect(rows).toContain('origin: input.origin ?? "user"');
});

test("scheduled runs use the pinned occurrence without requiring a trigger page", async () => {
  const source = await readRunEngine();
  expect(source).toContain('parsed.data.trigger.kind === "schedule"');
  expect(source).toContain('"AUTOMATION_SCHEDULE_MISSING"');
  expect(source).toContain("const row = scheduled ? null");
  expect(source).toContain("Scheduled automations have no trigger page");
});

test("Gmail delivery reuses owned connections, stable receipts, and reconnect handling", async () => {
  const [engine, service] = await Promise.all([
    readRunEngine(),
    readAutomationService(),
  ]);
  expect(engine).toContain("sendGmailComposition");
  expect(engine).toContain("isMailFeatureEnabled(env)");
  expect(engine).toContain('kind: "gmail"');
  expect(engine).toContain('status === "succeeded"');
  expect(engine).toContain('status: "reconnect_required"');
  expect(engine).toContain('status: "retrying"');
  expect(engine).toContain("error.retryable");
  expect(engine).toContain("`${context.run.id}:${action.id}`");
  expect(service).toContain("assertProtectedDefinitionOwner");
  expect(service).toContain("protectedLifecycleResponse");
  expect(service).toContain('"AUTOMATION_PROTECTED_CONFIGURATION"');
  expect(service).toContain("transfersProtectedOwnership");
});

test("webhook delivery encrypts headers, pins egress, and reuses stable retry IDs", async () => {
  const [engine, egress, nodeTransport, service] = await Promise.all([
    readRunEngine(),
    readFile(new URL("./webhook-egress.ts", import.meta.url), "utf8"),
    readFile(new URL("../../../app/node/pinned-webhook.ts", import.meta.url), "utf8"),
    readAutomationService(),
  ]);
  expect(engine).toContain("decryptAutomationSecret");
  expect(engine).toContain('kind: "webhook"');
  expect(engine).toContain("x-zilobase-delivery-id");
  expect(engine).toContain('status: "retrying"');
  expect(egress).toContain("Webhook redirects are not allowed");
  expect(egress).toContain("MAX_RESPONSE_BYTES = 1024 * 1024");
  expect(nodeTransport).toContain("hostname: input.pinnedAddress");
  expect(nodeTransport).toContain("socket.remoteAddress");
  expect(service).toContain("definitionForDuplicate(source.definition)");
  expect(service).toContain("? { ...action, headers: [] }");
});

test("Slack delivery is owner-scoped, channel-authorized, receipt-backed, and revocation-aware", async () => {
  const [engine, provider] = await Promise.all([
    readRunEngine(),
    readFile(new URL("./slack-provider.ts", import.meta.url), "utf8"),
  ]);
  expect(engine).toContain("const authorizedChannels = await listSlackChannels(env, connection)");
  expect(engine).toContain('kind: "slack"');
  expect(engine).toContain('status: "retrying"');
  expect(engine).toContain("invalidateDatabaseAutomationDependencies");
  expect(provider).toContain("public_channel,private_channel");
  expect(provider).toContain("client_msg_id: input.deliveryId");
});
