import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import {
  createDbClientForUrl,
  runWithDbEnv,
  db,
} from "../../apps/server/src/infrastructure/database";
import { CORE_MIGRATION_SET } from "../../apps/server/src/public/node-adapter-api";
import { runMigrationSets } from "@zilobase/runtime-adapter/node";
import * as tables from "../../apps/server/src/infrastructure/database/schema";
import { CookieJar, createApiClient } from "../selfhost/api-conformance.mjs";
import { startRuntime } from "./runtime.mts";
import { encryptAutomationSecret } from "../../apps/server/src/services/automations/actions/secret-crypto";
import { createBackgroundTaskV2 } from "../../apps/server/src/infrastructure/background/task-v2";
import { persistBackgroundTasks } from "../../apps/server/src/infrastructure/background/publication";
import { drainDatabaseAutomationEventWindows } from "../../apps/server/src/services/automations/triggers/event-evaluator";
import { recordBackgroundExhaustion } from "../../apps/server/src/app/background/failures";
import { replayBackgroundFailure } from "../../apps/server/src/app/background/operations/replay";
import { cleanupDatabaseAutomationHistory } from "../../apps/server/src/services/automations/history/history-maintenance";
import { createProviders } from "./providers.mts";

const kind = process.env.ZILOBASE_AUTOMATION_TEST_RUNTIME!;
assert.ok(["node", "worker"].includes(kind));
assert.ok(
  !process.env.CI || !process.env.ZILOBASE_AUTOMATION_TEST_MATCH,
  "CI must run the complete scenario matrix",
);
const url = process.env.ZILOBASE_BACKGROUND_VERIFY_URL!;
assert.equal(new URL(url).hostname, "127.0.0.1");
assert.equal(new URL(url).pathname, "/zilobase_background_verify");
const fixture = createDbClientForUrl(url);
const providers = createProviders();
const env = {
  DATABASE_URL: url,
  QUEUE_REDIS_URL: process.env.ZILOBASE_QUEUE_VERIFY_URL!,
  ZILOBASE_CELL_ID: `automation-${randomUUID()}`,
  ZILOBASE_EDITION: "community",
  DATABASE_AUTOMATIONS_ENABLED: "true",
  AUTOMATION_WEBHOOKS_ENABLED: "true",
  AUTOMATION_SLACK_ENABLED: "true",
  AUTOMATION_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  BETTER_AUTH_SECRET: randomUUID() + randomUUID(),
  BETTER_AUTH_URL: "http://127.0.0.1",
  CLIENT_URL: "http://127.0.0.1",
  ZILOBASE_BOOTSTRAP_TOKEN: randomUUID(),
  SLACK_CLIENT_ID: "fixture",
  SLACK_CLIENT_SECRET: "fixture",
};
const scoped = <T,>(work: () => Promise<T>) => runWithDbEnv({ DATABASE_URL: url }, work);
const checks: Array<{ name: string; status: string; durationMs: number; error?: string }> = [];
async function check(name: string, work: () => Promise<void>) {
  const match = process.env.ZILOBASE_AUTOMATION_TEST_MATCH;
  if (match && !name.includes("bootstrap") && !name.includes(match)) return;
  const started = Date.now();
  try {
    await work();
    checks.push({ name, status: "passed", durationMs: Date.now() - started });
    console.info(`PASS [${kind}] ${name}`);
  } catch (error) {
    checks.push({
      name,
      status: "failed",
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
async function until<T>(
  read: () => Promise<T>,
  ready: (value: T) => boolean,
  timeout = 30_000,
): Promise<T> {
  const deadline = Date.now() + timeout;
  let latest: T;
  do {
    latest = await read();
    if (ready(latest)) return latest;
    await sleep(100);
  } while (Date.now() < deadline);
  throw new Error(`Timed out waiting for fixture state: ${JSON.stringify(latest!)}`);
}
let runtime;
try {
  await fixture.client.connect();
  assert.equal(
    (
      await fixture.client.query(
        "select count(*)::int count from information_schema.tables where table_schema='public'",
      )
    ).rows[0].count,
    0,
  );
  await runMigrationSets(fixture.db, [CORE_MIGRATION_SET]);
  runtime = await startRuntime(kind, env, providers);
  const api = createApiClient({ internalOrigin: runtime.origin });
  const jar = new CookieJar();
  const email = "automations@example.test",
    password = randomUUID() + "-Aa1!";
  await check("authenticated bootstrap and sign-in", async () => {
    await api.bootstrapInstance({
      bootstrapToken: env.ZILOBASE_BOOTSTRAP_TOKEN,
      email,
      password,
      name: "Automation fixture",
      workspaceName: "Automations",
    });
    await api.signIn({ email, password, jar });
  });
  const workspace = (await fixture.client.query("select id from workspace limit 1")).rows[0].id;
  const owner = (await fixture.client.query('select id from "user" where email=$1', [email]))
    .rows[0].id;
  const request = async (path, method = "GET", body?, headers = {}, expected = 200) => {
    const response = await fetch(`${runtime.origin}${path}`, {
      method,
      headers: {
        cookie: jar.header(),
        origin: runtime.origin,
        ...(body ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
    return data;
  };
  const command = async (path, command) =>
    (
      await request(
        path,
        "POST",
        { protocolVersion: 2, commandId: randomUUID(), command },
        {},
        path === "/databases/commands" ? 201 : 200,
      )
    ).result;
  const created = await command("/databases/commands", {
    type: "database.create",
    workspaceId: workspace,
    name: "Tasks",
    standalone: true,
  });
  const host = created.database.id,
    source = created.activeDataSource.id;
  const sourcePath = `/databases/${host}/data-sources/${source}/commands`;
  const status = await command(sourcePath, {
    type: "property.create",
    name: "Done",
    propertyType: "checkbox",
    config: {},
    afterPropertyId: null,
    beforePropertyId: null,
  });
  const propertyId = status.property.id;
  const automationPath = `/databases/${host}/automations`;
  const definition = (
    actions,
    trigger = { kind: "event", match: "any", clauses: [{ id: "added", type: "page_added" }] },
    scope = { type: "data_source" },
  ) => ({ definitionVersion: 1, timezone: "UTC", scope, trigger, actions });
  const variables = [
    {
      id: "variables",
      type: "define_variables",
      variables: [{ name: "result", expression: { type: "literal", value: 7 } }],
    },
  ];
  const create = (definition, idempotencyKey = randomUUID(), expected = 201) =>
    request(
      automationPath,
      "POST",
      { name: "Fixture rule", dataSourceId: source, idempotencyKey, definition },
      { "Idempotency-Key": idempotencyKey },
      expected,
    );
  const row = () =>
    command(sourcePath, {
      type: "row.place",
      title: `Task ${randomUUID()}`,
      afterRowId: null,
      beforeRowId: null,
      parentRowId: null,
    });
  const runs = (id) => request(`${automationPath}/${id}/runs`).then((result) => result.runs);
  const completed = (id) =>
    until(
      () => runs(id),
      (rows) => rows.some((run) => ["succeeded", "failed", "skipped"].includes(run.status)),
    );
  await check("event creation through HTTP to real queue, worker and history", async () => {
    const automation = await create(definition(variables));
    await row();
    const [run] = await completed(automation.id);
    assert.equal(run.status, "succeeded");
    const detail = await request(`${automationPath}/${automation.id}/runs/${run.id}`);
    assert.equal(detail.steps.length, 1);
    assert.equal(detail.steps[0].outputSummary.variables.result, 7);
    await request(`${automationPath}/${automation.id}/pause`, "POST");
  });
  const pauseAll = () =>
    fixture.client.query(
      "update database_automation set status='paused', next_run_at=null where status='active'",
    );
  const drainWindows = () =>
    until(
      async () =>
        (
          await fixture.client.query(
            "select count(*)::int count from database_automation_event_window where status in ('accumulating','ready','processing')",
          )
        ).rows[0].count,
      (count) => count === 0,
    );
  const scenario = (name, work) =>
    check(name, async () => {
      await pauseAll();
      await drainWindows();
      try {
        await work();
      } finally {
        await pauseAll();
      }
    });
  const propertyTrigger = (match = "all", extra = []) => ({
    kind: "event",
    match,
    clauses: [
      { id: "done", type: "property_edited", propertyId, operator: "is_checked" },
      ...extra,
    ],
  });
  const change = (record, values, title?) =>
    command(sourcePath, {
      type: "row.change",
      rowId: record.id,
      valuesByPropertyId: values,
      ...(title === undefined ? {} : { title }),
    });
  const resume = () => runtime.resume();
  const sqlRuns = (id) =>
    fixture.client
      .query("select * from database_automation_run where automation_id=$1 order by created_at", [
        id,
      ])
      .then((result) => result.rows);
  const nudge = async (kind, resourceId) => {
    const task = createBackgroundTaskV2({ env, kind, resourceId });
    await scoped(() => persistBackgroundTasks(env, [task]));
    await runtime.deliver(task);
    return task;
  };
  const webhook = (path, headers = []) => ({
    id: "webhook",
    type: "send_webhook",
    url: `https://receiver.automation.test/${path}`,
    selectedPropertyIds: [propertyId],
    payloadFields: [
      { key: "status", value: { type: "reference", reference: "trigger_property", propertyId } },
    ],
    headers,
  });

  await scenario(
    "definition validation, create idempotency and optimistic revision conflicts",
    async () => {
      const key = randomUUID();
      const first = await create(definition(variables), key);
      const repeated = await create(definition(variables), key, 200);
      assert.equal(first.id, repeated.id);
      const updated = await request(
        `${automationPath}/${first.id}`,
        "PATCH",
        { name: "Updated", definition: definition(variables) },
        { "If-Match": String(first.version) },
      );
      assert.equal(updated.version, first.version + 1);
      await request(
        `${automationPath}/${first.id}`,
        "PATCH",
        { name: "Stale", definition: definition(variables) },
        { "If-Match": String(first.version) },
        409,
      );
      await create({ ...definition(variables), actions: [] }, randomUUID(), 400);
      const validation = await request(`${automationPath}/validate`, "POST", {
        dataSourceId: source,
        definition: definition([
          {
            id: "invalid",
            type: "edit_trigger_page",
            operations: [{ propertyId: "missing", mode: "clear" }],
          },
        ]),
      });
      assert.equal(validation.valid, false);
      const duplicate = await request(
        `${automationPath}/${first.id}/duplicate`,
        "POST",
        undefined,
        { "Idempotency-Key": randomUUID() },
        201,
      );
      assert.equal(duplicate.status, "paused");
      await request(`${automationPath}/${first.id}/pause`, "POST");
      await request(`${automationPath}/${first.id}/resume`, "POST");
      await request(`${automationPath}/${first.id}`, "DELETE");
      await request(`${automationPath}/${first.id}`, "GET", undefined, {}, 404);
    },
  );

  await scenario(
    "three-second batching, any/all property triggers and reverted changes",
    async () => {
      const target = await row();
      await drainWindows();
      const all = await create(
        definition(
          variables,
          propertyTrigger("all", [
            {
              id: "title",
              type: "property_edited",
              propertyId: "name",
              operator: "contains",
              operand: "Matched",
            },
          ]),
        ),
      );
      const any = await create(
        definition(
          variables,
          propertyTrigger("any", [
            {
              id: "other",
              type: "property_edited",
              propertyId: "name",
              operator: "contains",
              operand: "Never",
            },
          ]),
        ),
      );
      const started = Date.now();
      await change(target, { [propertyId]: true }, "Matched task");
      await change(target, { [propertyId]: false });
      await change(target, { [propertyId]: true });
      assert.equal((await sqlRuns(all.id)).length, 0, "Window must not execute before close");
      assert.equal((await completed(all.id))[0].status, "succeeded");
      assert.ok(Date.now() - started >= 2_900);
      await completed(any.id);
      assert.equal((await sqlRuns(all.id)).length, 1);
      const window = (
        await fixture.client.query(
          "select * from database_automation_event_window where id=(select event_window_id from database_automation_run where automation_id=$1)",
          [all.id],
        )
      ).rows[0];
      assert.equal(window.after_values[propertyId], true);
      await change(target, { [propertyId]: false });
      await change(target, { [propertyId]: true });
      await drainWindows();
      assert.equal((await sqlRuns(all.id)).length, 1, "Net-zero change must not trigger");
    },
  );

  await scenario("view filters skip nonmatching rows", async () => {
    const view = await command(`/databases/${host}/commands`, {
      type: "view.create",
      name: "Empty",
      viewType: "table",
      dataSourceId: source,
      config: {
        filters: [{ id: "filter", propertyId: "name", operator: "is", values: ["Never"] }],
      },
      afterViewId: null,
      beforeViewId: null,
    });
    const automation = await create(
      definition(variables, undefined, { type: "view", viewId: view.id }),
    );
    await row();
    const [run] = await completed(automation.id);
    assert.equal(run.status, "skipped");
    assert.equal(run.skipReason, "view_mismatch");
  });

  await scenario(
    "all actions, edit-page target modes, encrypted secrets and no automation chaining",
    async () => {
      const target = await row();
      await drainWindows();
      const relation = await command(sourcePath, {
        type: "property.create",
        name: "Related",
        propertyType: "relation",
        config: { relation: { relatedDataSourceId: source } },
        afterPropertyId: null,
        beforePropertyId: null,
      });
      const secret = await request(`/databases/${host}/automation-secrets`, "POST", {
        dataSourceId: source,
        purpose: "webhook_header",
        value: "fixture-header-value",
      });
      const connectionId = randomUUID();
      const encrypted = await encryptAutomationSecret(env, "fixture-slack-token", {
        ownerUserId: owner,
        purpose: "slack_access_token",
        secretId: connectionId,
        workspaceId: workspace,
      });
      await fixture.db.insert(tables.slackConnection).values({
        id: connectionId,
        workspaceId: workspace,
        ownerUserId: owner,
        teamId: "T_FIXTURE",
        teamName: "Fixture",
        botUserId: "B_FIXTURE",
        scopes: ["channels:read", "chat:write"],
        accessTokenCiphertext: encrypted.ciphertext,
        accessTokenIv: encrypted.iv,
        accessTokenKeyVersion: encrypted.keyVersion,
      });
      const operations = [{ mode: "set", propertyId, value: { type: "literal", value: true } }];
      const actions = [
        {
          id: "variables",
          type: "define_variables",
          variables: [
            { name: "targets", expression: { type: "literal", value: [target.pageId] } },
            { name: "computed", expression: { type: "formula", expression: "1 + 2" } },
          ],
        },
        { id: "trigger", type: "edit_trigger_page", operations },
        {
          id: "variable-target",
          type: "edit_pages",
          target: { type: "variable_pages", variableName: "targets" },
          operations,
        },
        {
          id: "related-target",
          type: "edit_pages",
          target: { type: "related_pages", propertyId: relation.property.id },
          operations,
        },
        {
          id: "filtered-target",
          type: "edit_pages",
          target: {
            type: "filtered_data_source",
            dataSourceId: source,
            filter: {
              match: "all",
              conditions: [
                {
                  id: "title",
                  type: "condition",
                  propertyId: "name",
                  operator: "is",
                  operand: target.page.name,
                },
              ],
            },
          },
          operations,
        },
        {
          id: "new-page",
          type: "add_page",
          dataSourceId: source,
          operations: [
            {
              mode: "set",
              propertyId: "name",
              value: { type: "literal", value: "Created by automation" },
            },
          ],
        },
        {
          id: "notify",
          type: "send_notification",
          recipients: [{ type: "selected_user", userId: owner }],
          message: { parts: [{ type: "text", text: "Automation finished" }] },
        },
        webhook("actions", [{ name: "x-fixture-token", secretId: secret.id }]),
        {
          id: "slack",
          type: "send_slack",
          connectionId,
          channelId: "C_FIXTURE",
          message: {
            parts: [
              { type: "text", text: "Finished " },
              {
                type: "value",
                value: { type: "reference", reference: "variable", name: "computed" },
              },
            ],
          },
        },
      ];
      const automation = await create(definition(actions));
      await command(sourcePath, {
        type: "row.place",
        title: "Action trigger",
        valuesByPropertyId: { [relation.property.id]: [target.pageId] },
        afterRowId: null,
        beforeRowId: null,
        parentRowId: null,
      });
      const [run] = await completed(automation.id);
      assert.equal(run.status, "succeeded");
      const detail = await request(`${automationPath}/${automation.id}/runs/${run.id}`);
      assert.deepEqual(
        detail.steps.map((step) => step.actionId),
        actions.map((action) => action.id),
      );
      assert.ok(detail.steps.every((step) => step.status === "succeeded"));
      assert.equal(detail.steps[0].outputSummary.variables.computed, 3);
      assert.equal(
        (
          await fixture.client.query(
            "select count(*)::int count from page where name='Created by automation'",
          )
        ).rows[0].count,
        1,
      );
      assert.equal(
        (
          await fixture.client.query(
            "select count(*)::int count from in_product_notification where run_id=$1",
            [run.id],
          )
        ).rows[0].count,
        1,
      );
      const sent = providers.requests.find((request) => request.url.endsWith("/actions"));
      assert.equal(sent.headers["x-fixture-token"], "fixture-header-value");
      assert.equal(sent.body.runId, run.id);
      const receipts = (
        await fixture.client.query(
          "select kind,status from database_automation_delivery where run_id=$1",
          [run.id],
        )
      ).rows;
      assert.ok(
        receipts.length >= 2 && receipts.every((receipt) => receipt.status === "succeeded"),
      );
      await drainWindows();
      assert.equal((await sqlRuns(automation.id)).length, 1, "Automation edits cannot chain");
      const task = await nudge("automation.run", run.id);
      await runtime.deliver(task);
      await until(
        () =>
          scoped(() =>
            db
              .select()
              .from(tables.backgroundDispatch)
              .where(eq(tables.backgroundDispatch.id, task.taskId)),
          ),
        (rows) => rows[0]?.status === "completed",
      );
      assert.equal(
        (
          await fixture.client.query(
            "select count(*)::int count from page where name='Created by automation'",
          )
        ).rows[0].count,
        1,
      );
    },
  );

  await scenario(
    "schedules use latest missed occurrence, advance once and honor disablement",
    async () => {
      const today = new Date().toISOString().slice(0, 10);
      const schedule = {
        kind: "schedule",
        schedule: {
          frequency: "daily",
          interval: 1,
          localTime: "00:00",
          startDate: "2026-01-01",
          timezone: "UTC",
        },
      };
      const automation = await create(definition(variables, schedule));
      const original = (
        await fixture.client.query("select next_run_at from database_automation where id=$1", [
          automation.id,
        ])
      ).rows[0].next_run_at;
      await runtime.maintenance();
      assert.equal((await sqlRuns(automation.id)).length, 0, "Future schedule cannot execute");
      await fixture.client.query(
        "update database_automation set next_run_at=now()-interval '3 days' where id=$1",
        [automation.id],
      );
      await runtime.updateEnv({ DATABASE_AUTOMATIONS_EXECUTION_DISABLED: "true" });
      await fixture.client.query(
        "update background_maintenance_task set next_run_at=now()-interval '1 second' where task_key='automation.schedules'",
      );
      await runtime.maintenance();
      assert.equal((await sqlRuns(automation.id)).length, 0);
      const disabledCursor = (
        await fixture.client.query("select next_run_at from database_automation where id=$1", [
          automation.id,
        ])
      ).rows[0].next_run_at;
      assert.ok(disabledCursor < new Date());
      await runtime.updateEnv({ DATABASE_AUTOMATIONS_EXECUTION_DISABLED: "false" });
      await fixture.client.query(
        "update background_maintenance_task set next_run_at=now()-interval '1 second' where task_key='automation.schedules'",
      );
      await runtime.maintenance();
      const [run] = await completed(automation.id);
      assert.equal(run.scheduledFor.slice(0, 10), today);
      assert.equal(run.status, "succeeded");
      await fixture.client.query(
        "update background_maintenance_task set next_run_at=now()-interval '1 second' where task_key='automation.schedules'",
      );
      await runtime.maintenance();
      assert.equal((await sqlRuns(automation.id)).length, 1);
      assert.ok(
        (
          await fixture.client.query("select next_run_at from database_automation where id=$1", [
            automation.id,
          ])
        ).rows[0].next_run_at >= original,
      );
    },
  );

  await scenario("schedule timezones, DST cursors and end dates", async () => {
    const year = new Date().getUTCFullYear() + 1;
    const sunday = (month, ordinal) => {
      const first = new Date(Date.UTC(year, month - 1, 1));
      return `${year}-${String(month).padStart(2, "0")}-${String(1 + ((7 - first.getUTCDay()) % 7) + (ordinal - 1) * 7).padStart(2, "0")}`;
    };
    const spring = sunday(3, 2),
      fall = sunday(11, 1);
    for (const [timezone, date, localTime, expected] of [
      ["America/New_York", spring, "02:30", `${spring}T07:00:00.000Z`],
      ["America/New_York", fall, "01:30", `${fall}T05:30:00.000Z`],
      ["Asia/Kolkata", `${year}-01-01`, "09:30", `${year}-01-01T04:00:00.000Z`],
    ]) {
      const automation = await create(
        definition(variables, {
          kind: "schedule",
          schedule: {
            frequency: "daily",
            interval: 1,
            timezone,
            localTime,
            startDate: date,
            endDate: date,
          },
        }),
      );
      const cursor = (
        await fixture.client.query("select next_run_at from database_automation where id=$1", [
          automation.id,
        ])
      ).rows[0].next_run_at;
      assert.equal(cursor.toISOString(), expected);
      assert.equal((await sqlRuns(automation.id)).length, 0);
    }
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const expected = `${yesterday}T00:00:00.000Z`;
    const ended = await create(
      definition(variables, {
        kind: "schedule",
        schedule: {
          frequency: "daily",
          interval: 1,
          timezone: "UTC",
          localTime: "00:00",
          startDate: yesterday,
          endDate: yesterday,
        },
      }),
    );
    // Reproduce the last cursor that became due before scheduler downtime.
    await fixture.client.query("update database_automation set next_run_at=$2 where id=$1", [
      ended.id,
      expected,
    ]);
    for (let scan = 0; scan < 2; scan++) {
      await fixture.client.query(
        "update background_maintenance_task set next_run_at=now()-interval '1 second' where task_key='automation.schedules'",
      );
      await runtime.maintenance();
      const [run] = await completed(ended.id);
      assert.equal(run.scheduledFor, expected);
      assert.equal(run.status, "succeeded");
      assert.equal(
        (
          await fixture.client.query("select next_run_at from database_automation where id=$1", [
            ended.id,
          ])
        ).rows[0].next_run_at,
        null,
      );
      assert.equal((await sqlRuns(ended.id)).length, 1);
    }
  });

  await scenario("disabled event windows retain a durable retry and resume", async () => {
    const automation = await create(definition(variables));
    await runtime.updateEnv({ DATABASE_AUTOMATIONS_EXECUTION_DISABLED: "true" });
    await row();
    const retry = await until(
      async () =>
        (
          await fixture.client.query(
            "select * from background_dispatch where kind='automation.event_window' and status in ('pending','published') and available_at > now()+interval '30 seconds' order by created_at desc limit 1",
          )
        ).rows[0],
      Boolean,
    );
    assert.ok(retry);
    assert.equal((await sqlRuns(automation.id)).length, 0);
    await runtime.updateEnv({ DATABASE_AUTOMATIONS_EXECUTION_DISABLED: "false" });
    await nudge("automation.event_window", retry.resource_id);
    assert.equal((await completed(automation.id))[0].status, "succeeded");
  });

  await scenario("pinned revisions and live property reads survive queue delay", async () => {
    const target = await row();
    await drainWindows();
    const automation = await create(definition([webhook("live-values")], propertyTrigger()));
    await change(target, { [propertyId]: true });
    // Hold execution with a persisted domain lease while allowing event matching.
    // Pause the run lane through SQL before the event window is evaluated.
    await runtime.pause();
    const window = (
      await fixture.client.query(
        "select id from database_automation_event_window where row_id=$1 and status='accumulating' order by created_at desc limit 1",
        [target.id],
      )
    ).rows[0];
    await fixture.client.query(
      "update database_automation_event_window set closes_at=now()-interval '1 second', next_attempt_at=now()-interval '1 second' where id=$1",
      [window.id],
    );
    await scoped(() =>
      drainDatabaseAutomationEventWindows(env, {
        windowId: window.id,
        workerId: "fixture-evaluator",
      }),
    );
    const [queued] = await sqlRuns(automation.id);
    assert.ok(queued);
    await change(target, { [propertyId]: false });
    const updated = await request(
      `${automationPath}/${automation.id}`,
      "PATCH",
      { name: "New revision", definition: definition(variables, propertyTrigger()) },
      { "If-Match": String(automation.version) },
    );
    assert.notEqual(updated.currentRevisionId, queued.revision_id);
    await resume();
    await nudge("automation.run", queued.id);
    assert.equal((await completed(automation.id))[0].revisionId, queued.revision_id);
    const sent = providers.requests.find((request) => request.url.endsWith("/live-values"));
    assert.equal(sent.body.fields.status, false);
  });

  await scenario("webhook retries retain identity and restore successful steps", async () => {
    const automation = await create(definition([...variables, webhook("retry")]));
    await row();
    const [run] = await completed(automation.id);
    assert.equal(run.status, "succeeded");
    const sent = providers.requests.filter((request) => request.url.endsWith("/retry"));
    assert.equal(sent.length, 2);
    assert.equal(sent[0].body.deliveryId, sent[1].body.deliveryId);
    const detail = await request(`${automationPath}/${automation.id}/runs/${run.id}`);
    const steps = (
      await fixture.client.query(
        "select attempts from database_automation_step_run where run_id=$1 order by action_index",
        [run.id],
      )
    ).rows;
    assert.equal(steps[0].attempts, 1);
    assert.equal(steps[1].attempts, 2);
    assert.equal(detail.steps[0].outputSummary.variables.result, 7);
  });

  await scenario("terminal provider failure preserves earlier committed actions", async () => {
    const automation = await create(
      definition([
        {
          id: "new-page",
          type: "add_page",
          dataSourceId: source,
          operations: [
            {
              propertyId: "name",
              mode: "set",
              value: { type: "literal", value: "Retained after failure" },
            },
          ],
        },
        webhook("terminal"),
      ]),
    );
    await row();
    const [run] = await completed(automation.id);
    assert.equal(run.status, "failed");
    assert.equal((await request(`${automationPath}/${automation.id}`)).status, "error");
    assert.equal(
      (
        await fixture.client.query(
          "select count(*)::int count from page where name='Retained after failure'",
        )
      ).rows[0].count,
      1,
    );
    const detail = await request(`${automationPath}/${automation.id}/runs/${run.id}`);
    assert.deepEqual(
      detail.steps.map((step) => step.status),
      ["succeeded", "failed"],
    );
  });

  await scenario("authentication, cross-workspace access and secret ownership", async () => {
    const unauthenticated = await fetch(
      `${runtime.origin}${automationPath}?dataSourceId=${source}`,
    );
    assert.equal(unauthenticated.status, 401);
    const foreignWorkspace = randomUUID(),
      foreignHost = randomUUID(),
      foreignSource = randomUUID();
    await fixture.db
      .insert(tables.workspace)
      .values({ id: foreignWorkspace, name: "Foreign", slug: foreignWorkspace });
    await fixture.db
      .insert(tables.database)
      .values({ id: foreignHost, workspaceId: foreignWorkspace, name: "Foreign" });
    await fixture.db.insert(tables.dataSource).values({
      id: foreignSource,
      workspaceId: foreignWorkspace,
      parentDatabaseId: foreignHost,
      name: "Foreign",
    });
    await request(
      `/databases/${foreignHost}/automations?dataSourceId=${foreignSource}`,
      "GET",
      undefined,
      {},
      403,
    );
    await request(`${automationPath}?dataSourceId=${foreignSource}`, "GET", undefined, {}, 403);
    const outsider = randomUUID();
    await fixture.db
      .insert(tables.user)
      .values({ id: outsider, name: "Outsider", email: `${outsider}@example.test` });
    const secret = randomUUID();
    const encrypted = await encryptAutomationSecret(env, "outsider-secret", {
      ownerUserId: outsider,
      purpose: "webhook_header",
      secretId: secret,
      workspaceId: workspace,
    });
    await fixture.db.insert(tables.automationSecret).values({
      ...encrypted,
      id: secret,
      ownerUserId: outsider,
      workspaceId: workspace,
      purpose: "webhook_header",
    });
    await create(
      definition([webhook("forbidden", [{ name: "x-token", secretId: secret }])]),
      randomUUID(),
      400,
    );
    await create(
      definition(
        [webhook("private")].map((action) => ({ ...action, url: "https://127.0.0.1/private" })),
      ),
      randomUUID(),
      400,
    );
  });

  await scenario("locked databases and revoked owner authority skip matched events", async () => {
    const locked = await create(definition(variables));
    await row();
    await fixture.client.query(
      "update database set config=jsonb_build_object('locked',true) where id=$1",
      [host],
    );
    try {
      const [run] = await until(
        () => sqlRuns(locked.id),
        (rows) => rows.some((run) => run.status === "skipped"),
      );
      assert.equal(run.skip_reason, "locked_database");
    } finally {
      await fixture.client.query("update database set config=null where id=$1", [host]);
    }
    await request(`${automationPath}/${locked.id}/pause`, "POST");
    const revoked = await create(definition(variables));
    await row();
    const memberships = await fixture.db
      .select()
      .from(tables.member)
      .where(eq(tables.member.userId, owner));
    await fixture.db.delete(tables.member).where(eq(tables.member.userId, owner));
    try {
      const [run] = await until(
        () => sqlRuns(revoked.id),
        (rows) => rows.some((run) => run.status === "skipped"),
      );
      assert.equal(run.skip_reason, "revoked_authority");
    } finally {
      await fixture.db.insert(tables.member).values(memberships);
    }
  });

  await scenario("dependency invalidation blocks resume until repaired", async () => {
    const property = await command(sourcePath, {
      type: "property.create",
      name: "Disposable",
      propertyType: "checkbox",
      config: {},
      afterPropertyId: null,
      beforePropertyId: null,
    });
    const automation = await create(
      definition([
        {
          id: "edit",
          type: "edit_trigger_page",
          operations: [{ mode: "clear", propertyId: property.property.id }],
        },
      ]),
    );
    await command(sourcePath, { type: "property.archive", propertyId: property.id });
    assert.equal((await request(`${automationPath}/${automation.id}`)).status, "error");
    await request(`${automationPath}/${automation.id}/resume`, "POST", undefined, {}, 409);
  });

  await scenario("lease loss fences stale workers and reuses an accepted delivery", async () => {
    const barrier = providers.barrier("/stale");
    const automation = await create(definition([webhook("stale")]));
    await row();
    await Promise.race([
      barrier.entered,
      sleep(20_000).then(() => {
        throw new Error("Provider barrier timed out");
      }),
    ]);
    const [running] = await sqlRuns(automation.id);
    const metadata = (
      await fixture.client.query(
        "select status,last_run_at,last_run_status,updated_at from database_automation where id=$1",
        [automation.id],
      )
    ).rows[0];
    await fixture.client.query(
      "update database_automation_run set lease_owner='fixture-new-owner',lease_expires_at=now()+interval '2 minutes' where id=$1",
      [running.id],
    );
    barrier.release();
    await until(
      async () =>
        (
          await fixture.client.query(
            "select status from database_automation_delivery where run_id=$1",
            [running.id],
          )
        ).rows[0]?.status,
      (status) => status === "succeeded",
    );
    await until(
      async () =>
        (
          await fixture.client.query(
            "select count(*)::int count from background_dispatch where kind='automation.run' and resource_id=$1 and status='completed'",
            [running.id],
          )
        ).rows[0].count,
      (count) => count > 0,
    );
    const [untouched] = await sqlRuns(automation.id);
    assert.equal(untouched.lease_owner, "fixture-new-owner");
    assert.equal(untouched.status, "running");
    assert.equal((await request(`${automationPath}/${automation.id}`)).status, "active");
    assert.deepEqual(
      (
        await fixture.client.query(
          "select status,last_run_at,last_run_status,updated_at from database_automation where id=$1",
          [automation.id],
        )
      ).rows[0],
      metadata,
    );
    assert.equal(
      (
        await fixture.client.query(
          "select status from database_automation_step_run where run_id=$1",
          [running.id],
        )
      ).rows[0].status,
      "running",
    );
    await fixture.client.query(
      "update database_automation_run set lease_expires_at=now()-interval '1 second' where id=$1",
      [running.id],
    );
    await nudge("automation.run", running.id);
    assert.equal((await completed(automation.id))[0].status, "succeeded");
    assert.equal(providers.requests.filter((request) => request.url.endsWith("/stale")).length, 1);
  });

  await scenario("failure from an old revision cannot disable a repaired automation", async () => {
    const barrier = providers.barrier("/terminal-old-revision");
    const automation = await create(definition([webhook("terminal-old-revision")]));
    await row();
    await Promise.race([
      barrier.entered,
      sleep(20_000).then(() => {
        throw new Error("Provider barrier timed out");
      }),
    ]);
    await request(
      `${automationPath}/${automation.id}`,
      "PATCH",
      { name: "Repaired", definition: definition(variables) },
      { "If-Match": String(automation.version) },
    );
    barrier.release();
    assert.equal((await completed(automation.id))[0].status, "failed");
    assert.equal((await request(`${automationPath}/${automation.id}`)).status, "active");
  });

  await scenario(
    "real PostgreSQL serialization failures retry without disabling automation",
    async () => {
      await fixture.client.query("create table automation_fault(enabled boolean not null)");
      await fixture.client.query("insert into automation_fault values(true)");
      await fixture.client.query(
        `create function automation_fault() returns trigger language plpgsql as $$ begin if (select enabled from automation_fault) then raise exception 'fixture serialization failure' using errcode='40001'; end if; return new; end $$`,
      );
      await fixture.client.query(
        "create trigger automation_fault before insert on database_automation_step_run for each row execute function automation_fault()",
      );
      const automation = await create(definition(variables));
      try {
        await row();
        const [running] = await until(
          () => sqlRuns(automation.id),
          (rows) => rows.some((run) => run.status === "running"),
        );
        await until(
          async () =>
            (
              await fixture.client.query(
                "select status from background_dispatch where resource_id=$1 and kind='automation.run' order by created_at limit 1",
                [running.id],
              )
            ).rows[0]?.status,
          (status) => status === "published" || status === "completed",
        );
        assert.equal((await request(`${automationPath}/${automation.id}`)).status, "active");
        assert.equal(
          (
            await fixture.client.query(
              "select count(*)::int count from database_automation_step_run where run_id=$1",
              [running.id],
            )
          ).rows[0].count,
          0,
        );
        await fixture.client.query("update automation_fault set enabled=false");
        await fixture.client.query(
          "update database_automation_run set lease_expires_at=now()-interval '1 second' where id=$1",
          [running.id],
        );
        await nudge("automation.run", running.id);
        assert.equal((await completed(automation.id))[0].status, "succeeded");
      } finally {
        await fixture.client.query("drop trigger automation_fault on database_automation_step_run");
        await fixture.client.query("drop function automation_fault()");
        await fixture.client.query("drop table automation_fault");
      }
    },
  );

  await scenario(
    "database deadlocks after provider acceptance preserve receipts and completed steps",
    async () => {
      await fixture.client.query(
        "create table automation_persistence_fault(enabled boolean not null)",
      );
      await fixture.client.query("insert into automation_persistence_fault values(true)");
      await fixture.client.query(
        `create function automation_persistence_fault() returns trigger language plpgsql as $$ begin if new.status='succeeded' and new.action_id='webhook' and (select enabled from automation_persistence_fault) then raise exception 'fixture deadlock' using errcode='40P01'; end if; return new; end $$`,
      );
      await fixture.client.query(
        "create trigger automation_persistence_fault before update on database_automation_step_run for each row execute function automation_persistence_fault()",
      );
      const automation = await create(definition([...variables, webhook("persistence")]));
      try {
        await row();
        const [run] = await until(
          () => sqlRuns(automation.id),
          (rows) => rows.some((row) => row.status === "running"),
        );
        await until(
          async () =>
            (
              await fixture.client.query(
                "select status from database_automation_delivery where run_id=$1",
                [run.id],
              )
            ).rows,
          (rows) => rows[0]?.status === "succeeded",
        );
        await until(
          async () =>
            (
              await fixture.client.query(
                "select status from background_dispatch where resource_id=$1 and kind='automation.run' order by created_at limit 1",
                [run.id],
              )
            ).rows[0]?.status,
          (status) => status === "published" || status === "completed",
        );
        assert.equal((await request(`${automationPath}/${automation.id}`)).status, "active");
        assert.equal(
          (
            await fixture.client.query(
              "select status from database_automation_step_run where run_id=$1 and action_id='variables'",
              [run.id],
            )
          ).rows[0].status,
          "succeeded",
        );
        await fixture.client.query("update automation_persistence_fault set enabled=false");
        await fixture.client.query(
          "update database_automation_run set lease_expires_at=now()-interval '1 second' where id=$1",
          [run.id],
        );
        await nudge("automation.run", run.id);
        assert.equal((await completed(automation.id))[0].status, "succeeded");
        assert.equal(
          providers.requests.filter((request) => request.url.endsWith("/persistence")).length,
          1,
        );
        assert.equal(
          (
            await fixture.client.query(
              "select attempts from database_automation_step_run where run_id=$1 and action_id='variables'",
              [run.id],
            )
          ).rows[0].attempts,
          1,
        );
      } finally {
        await fixture.client.query(
          "drop trigger automation_persistence_fault on database_automation_step_run",
        );
        await fixture.client.query("drop function automation_persistence_fault()");
        await fixture.client.query("drop table automation_persistence_fault");
      }
    },
  );

  await scenario("transport exhaustion and explicit replay preserve run identity", async () => {
    const automation = await create(definition(variables));
    await runtime.pause();
    await row();
    const window = (
      await fixture.client.query(
        "select id from database_automation_event_window where status='accumulating' order by created_at desc limit 1",
      )
    ).rows[0];
    await fixture.client.query(
      "update database_automation_event_window set closes_at=now()-interval '1 second',next_attempt_at=now()-interval '1 second' where id=$1",
      [window.id],
    );
    await scoped(() =>
      drainDatabaseAutomationEventWindows(env, {
        windowId: window.id,
        workerId: "fixture-evaluator",
      }),
    );
    const [run] = await sqlRuns(automation.id);
    const dispatch = (
      await fixture.client.query(
        "select task from background_dispatch where resource_id=$1 and kind='automation.run'",
        [run.id],
      )
    ).rows[0].task;
    if (kind === "worker") {
      await runtime.resume();
      await runtime.deadLetter(dispatch);
      await until(
        () => sqlRuns(automation.id),
        (rows) => rows[0]?.error_code === "TRANSPORT_RETRIES_EXHAUSTED",
      );
    } else await scoped(() => recordBackgroundExhaustion(env, dispatch, "automation"));
    assert.equal((await sqlRuns(automation.id))[0].error_code, "TRANSPORT_RETRIES_EXHAUSTED");
    await scoped(() => replayBackgroundFailure(env, dispatch.taskId));
    await resume();
    await runtime.publish();
    assert.equal((await completed(automation.id))[0].id, run.id);
    assert.equal((await sqlRuns(automation.id)).length, 1);
  });

  await scenario(
    "retention removes old terminal details but retains recent summaries",
    async () => {
      const automation = await create(definition(variables));
      await row();
      const [run] = await completed(automation.id);
      await fixture.client.query(
        "update database_automation_step_run set created_at=now()-interval '8 days' where run_id=$1",
        [run.id],
      );
      await scoped(() => cleanupDatabaseAutomationHistory(env));
      assert.equal(
        (
          await fixture.client.query(
            "select count(*)::int count from database_automation_step_run where run_id=$1",
            [run.id],
          )
        ).rows[0].count,
        0,
      );
      assert.equal((await sqlRuns(automation.id)).length, 1);
      await fixture.client.query(
        "update database_automation_run set created_at=now()-interval '31 days' where id=$1",
        [run.id],
      );
      await scoped(() => cleanupDatabaseAutomationHistory(env));
      assert.equal((await sqlRuns(automation.id)).length, 0);
    },
  );

  await scenario("disabled queued runs retain their receipts and resume once", async () => {
    const automation = await create(definition(variables));
    await runtime.pause();
    await row();
    const window = (
      await fixture.client.query(
        "select id from database_automation_event_window where status='accumulating' order by created_at desc limit 1",
      )
    ).rows[0];
    await fixture.client.query(
      "update database_automation_event_window set closes_at=now()-interval '1 second',next_attempt_at=now()-interval '1 second' where id=$1",
      [window.id],
    );
    await scoped(() =>
      drainDatabaseAutomationEventWindows(env, {
        windowId: window.id,
        workerId: "fixture-evaluator",
      }),
    );
    const [run] = await sqlRuns(automation.id);
    await runtime.updateEnv({ DATABASE_AUTOMATIONS_EXECUTION_DISABLED: "true" });
    await resume();
    await nudge("automation.run", run.id);
    await until(
      async () =>
        (
          await fixture.client.query(
            "select count(*)::int count from background_dispatch where kind='automation.run' and resource_id=$1 and status in ('pending','published') and available_at>now()+interval '30 seconds'",
            [run.id],
          )
        ).rows[0].count,
      (count) => count > 0,
    );
    assert.equal((await sqlRuns(automation.id))[0].status, "queued");
    assert.equal(
      (
        await fixture.client.query(
          "select count(*)::int count from database_automation_step_run where run_id=$1",
          [run.id],
        )
      ).rows[0].count,
      0,
    );
    await runtime.updateEnv({ DATABASE_AUTOMATIONS_EXECUTION_DISABLED: "false" });
    await nudge("automation.run", run.id);
    assert.equal((await completed(automation.id))[0].status, "succeeded");
  });

  await scenario("competing deliveries cannot execute the same action concurrently", async () => {
    const barrier = providers.barrier("/competing");
    const automation = await create(definition([webhook("competing")]));
    await row();
    await until(
      async () => providers.requests.some((request) => request.url.endsWith("/competing")),
      Boolean,
    );
    const [run] = await sqlRuns(automation.id);
    await Promise.all(Array.from({ length: 8 }, () => nudge("automation.run", run.id)));
    assert.equal(
      (
        await fixture.client.query(
          "select count(*)::int count from database_automation_step_run where run_id=$1",
          [run.id],
        )
      ).rows[0].count,
      1,
    );
    assert.equal(
      providers.requests.filter((request) => request.url.endsWith("/competing")).length,
      1,
    );
    barrier.release();
    assert.equal((await completed(automation.id))[0].status, "succeeded");
  });

  await scenario(
    "queue outage retains committed edits and recovers outbox publication",
    async () => {
      const automation = await create(definition(variables));
      await runtime.setQueueAvailable(false);
      try {
        const target = await row();
        assert.equal(
          (
            await fixture.client.query("select count(*)::int count from database_row where id=$1", [
              target.id,
            ])
          ).rows[0].count,
          1,
        );
        assert.ok(
          (
            await fixture.client.query(
              "select count(*)::int count from background_dispatch where status='pending' and kind='automation.event_window'",
            )
          ).rows[0].count > 0,
        );
        // Worker waitUntil publication can still be releasing its claim after
        // the HTTP response. Recover only after the failed enqueue is persisted.
        await until(
          async () =>
            (
              await fixture.client.query(
                "select d.status,d.lease_owner,d.error_code from background_dispatch d join database_automation_event_window w on w.id=d.resource_id where d.kind='automation.event_window' and w.row_id=$1 order by d.created_at desc limit 1",
                [target.id],
              )
            ).rows[0],
          (dispatch) =>
            dispatch?.status === "pending" &&
            dispatch.lease_owner === null &&
            dispatch.error_code !== null,
        );
      } finally {
        await runtime.setQueueAvailable(true);
      }
      await fixture.client.query(
        "update background_dispatch set next_publication_at=now()-interval '1 second' where status='pending'",
      );
      await runtime.publish();
      assert.equal((await completed(automation.id))[0].status, "succeeded");
      assert.equal((await sqlRuns(automation.id)).length, 1);
    },
  );

  await scenario("retention preserves completed receipts needed by unfinished runs", async () => {
    const barrier = providers.barrier("/retention");
    const automation = await create(definition([...variables, webhook("retention")]));
    await row();
    await until(
      async () => providers.requests.some((request) => request.url.endsWith("/retention")),
      Boolean,
    );
    const [run] = await sqlRuns(automation.id);
    try {
      await fixture.client.query(
        "update database_automation_step_run set created_at=now()-interval '8 days' where run_id=$1 and status='succeeded'",
        [run.id],
      );
      await scoped(() => cleanupDatabaseAutomationHistory(env));
      const saved = (
        await fixture.client.query(
          "select output_summary from database_automation_step_run where run_id=$1 and action_id='variables'",
          [run.id],
        )
      ).rows;
      assert.equal(saved.length, 1);
      assert.equal(saved[0].output_summary.variables.result, 7);
    } finally {
      barrier.release();
    }
    assert.equal((await completed(automation.id))[0].status, "succeeded");
  });

  if (kind === "node")
    await scenario(
      "Node process termination recovers without repeating completed actions",
      async () => {
        const automation = await create(definition([...variables, webhook("process-crash")]));
        await runtime.pause();
        try {
          await row();
          await fixture.client.query(
            "update database_automation_event_window set closes_at=now(),next_attempt_at=now() where status='accumulating'",
          );
          await scoped(() =>
            drainDatabaseAutomationEventWindows(env, { workerId: "crash-fixture-evaluator" }),
          );
          const [run] = await sqlRuns(automation.id);
          const killed = await runtime.crashDuringWebhook();
          assert.equal((await sqlRuns(automation.id))[0].status, "running");
          assert.equal(
            (
              await fixture.client.query(
                "select status from database_automation_step_run where run_id=$1 and action_id='variables'",
                [run.id],
              )
            ).rows[0].status,
            "succeeded",
          );
          await fixture.client.query(
            "update database_automation_run set lease_expires_at=now()-interval '1 second' where id=$1",
            [run.id],
          );
          await fixture.client.query(
            "update background_dispatch set lease_expires_at=now()-interval '1 second',next_publication_at=now() where resource_id=$1 and status='running'",
            [run.id],
          );
          await runtime.resume();
          await nudge("automation.run", run.id);
          assert.equal((await completed(automation.id))[0].status, "succeeded");
          const delivered = providers.requests.filter((request) =>
            request.url.endsWith("/process-crash"),
          );
          assert.equal(delivered.length, 1);
          assert.equal(delivered[0].headers["x-zilobase-delivery-id"], killed.deliveryId);
          assert.equal(
            (
              await fixture.client.query(
                "select attempts from database_automation_step_run where run_id=$1 and action_id='variables'",
                [run.id],
              )
            ).rows[0].attempts,
            1,
          );
        } finally {
          await runtime.resume();
        }
      },
    );
} catch (error) {
  console.error(
    "Fixture diagnostic",
    JSON.stringify(
      (
        await fixture.client.query(
          "select id, kind, status, resource_id, error_code from background_dispatch where status <> 'completed' limit 25",
        )
      ).rows,
    ),
  );
  console.error(
    "Window diagnostic",
    JSON.stringify(
      (
        await fixture.client.query(
          "select id,status,terminal_reason from database_automation_event_window order by opened_at desc limit 25",
        )
      ).rows,
    ),
  );
  throw error;
} finally {
  providers.releaseAll();
  await runtime?.close();
  await fixture.client.end();
  await mkdir(".test-results/automations", { recursive: true });
  await writeFile(
    `.test-results/automations/${kind}.json`,
    JSON.stringify({ runtime: kind, checks }, null, 2),
  );
}
