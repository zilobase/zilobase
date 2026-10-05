import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { setTimeout } from "node:timers/promises";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { CookieJar, createApiClient } from "../selfhost/api-conformance.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const measurementFile = process.env.ZILOBASE_APP_MEASUREMENTS;
const measurements = { sampleCount: 1, requests: [], startupMs: null, heap: [], cache: [] };
const measurementsPending = [];
let measurementPhase = "startup";
const exec = promisify(execFile);
const runId = randomUUID();
const containers = [];
const apiOrigin = "http://127.0.0.1:1497";
const webOrigin = "http://127.0.0.1:1496";
let server, vite, browser, page;
let serverLog = "";

async function container(image, port, args = [], command = []) {
  const name = `zilobase-browser-${containers.length}-${runId}`;
  await exec("docker", [
    "run",
    "--pull=never",
    "--rm",
    "--name",
    name,
    "-p",
    `127.0.0.1::${port}`,
    ...args,
    "-d",
    image,
    ...command,
  ]);
  containers.push(name);
  const { stdout } = await exec("docker", ["port", name, `${port}/tcp`]);
  assert.match(stdout.trim(), /^127\.0\.0\.1:\d+$/);
  return stdout.trim();
}
async function waitFor(check, label) {
  for (let i = 0; i < 150; i++) {
    try {
      if (await check()) return;
    } catch {}
    await setTimeout(200);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

try {
  const postgres = await container("postgres:17.10-alpine", 5432, [
    "--tmpfs",
    "/var/lib/postgresql/data",
    "-e",
    "POSTGRES_PASSWORD=browser-test-only",
    "-e",
    "POSTGRES_DB=zilobase_browser_verify",
  ]);
  const redis = await container("valkey/valkey:8-alpine", 6379);
  const storage = await container(
    "rustfs/rustfs:1.0.0",
    9000,
    ["-e", "RUSTFS_ACCESS_KEY=browser-test", "-e", "RUSTFS_SECRET_KEY=browser-test-only-secret"],
    ["/data"],
  );
  const storageRequire = createRequire(`${root}packages/runtime-adapter/package.json`);
  const { S3Client, CreateBucketCommand } = await import(
    pathToFileURL(storageRequire.resolve("@aws-sdk/client-s3"))
  );
  const s3 = new S3Client({
    endpoint: `http://${storage}`,
    forcePathStyle: true,
    region: "auto",
    credentials: { accessKeyId: "browser-test", secretAccessKey: "browser-test-only-secret" },
  });
  await waitFor(async () => {
    await s3.send(new CreateBucketCommand({ Bucket: "browser-verification" }));
    return true;
  }, "isolated object storage");
  s3.destroy();
  await waitFor(async () => {
    await exec("docker", [
      "exec",
      containers[0],
      "pg_isready",
      "-h",
      "127.0.0.1",
      "-U",
      "postgres",
    ]);
    return true;
  }, "isolated PostgreSQL");
  const token = randomUUID() + randomUUID();
  const env = {
    PATH: process.env.PATH,
    NODE_ENV: "development",
    HOST: "127.0.0.1",
    PORT: "1497",
    BACKGROUND_HEALTH_PORT: "1495",
    DATABASE_URL: `postgres://postgres:browser-test-only@${postgres}/zilobase_browser_verify`,
    REALTIME_REDIS_URL: `redis://${redis}`,
    BETTER_AUTH_SECRET: randomUUID() + randomUUID(),
    BETTER_AUTH_URL: webOrigin,
    CLIENT_URL: webOrigin,
    ZILOBASE_BOOTSTRAP_TOKEN: token,
    ZILOBASE_AUTO_MIGRATE: "true",
    ZILOBASE_ENV_FILE: "/dev/null",
    ZILOBASE_PROCESS_ROLE: "all",
    S3_ENDPOINT: `http://${storage}`,
    S3_PUBLIC_ENDPOINT: `http://${storage}`,
    S3_ACCESS_KEY_ID: "browser-test",
    S3_SECRET_ACCESS_KEY: "browser-test-only-secret",
    S3_BUCKET_NAME: "browser-verification",
  };
  server = spawn(`${root}node_modules/.bin/tsx`, ["apps/server/src/entrypoints/serverful.ts"], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [server.stdout, server.stderr])
    stream.on("data", (chunk) => {
      serverLog = (serverLog + chunk).slice(-16000);
    });
  await waitFor(async () => (await fetch(`${apiOrigin}/ready`)).ok, "application server");
  process.env.VITE_BACKEND_PROXY_TARGET = apiOrigin;
  process.env.VITE_API_URL = apiOrigin;
  const require = createRequire(`${root}apps/web/package.json`);
  const { createServer } = await import(pathToFileURL(require.resolve("vite")));
  vite = await createServer({
    root: `${root}apps/web`,
    configFile: `${root}apps/web/vite.config.ts`,
    envDir: false,
    cacheDir: `${root}.dev/database-app-cache`,
    server: { host: "127.0.0.1", port: 1496, strictPort: true, open: false },
  });
  await vite.listen();
  const api = createApiClient({ internalOrigin: apiOrigin, publicOrigin: webOrigin });
  const email = "controller-browser@example.test",
    password = randomUUID() + "-Aa1!";
  const setup = await api.bootstrapInstance({
    bootstrapToken: token,
    email,
    password,
    name: "Controller Browser",
    workspaceName: "Controller verification",
  });
  const jar = new CookieJar();
  await api.signIn({ email, password, jar });
  const command = async (path, command) => {
    const response = await api.requestJson(path, {
      jar,
      method: "POST",
      body: { protocolVersion: 2, commandId: randomUUID(), command },
    });
    assert.ok(response.response.ok, JSON.stringify(response.data));
    return response.data.result;
  };
  const created = await command("/databases/commands", {
    type: "database.create",
    workspaceId: setup.data.workspaceId,
    name: "Browser tasks",
    standalone: true,
  });
  const host = created.database.id,
    source = created.activeDataSource.id;
  const sourcePath = `/databases/${host}/data-sources/${source}/commands`;
  await command(sourcePath, {
    type: "dataSource.update",
    patch: { configuration: [{ operation: "set", path: ["setupDismissed"], value: true }] },
  });
  const status = await command(sourcePath, {
    type: "property.create",
    name: "Done",
    propertyType: "checkbox",
    config: {},
    afterPropertyId: null,
    beforePropertyId: null,
  });
  const createdRows = [];
  for (const title of ["Alpha browser row", "Beta browser row", "Gamma browser row"])
    createdRows.push(
      await command(sourcePath, {
        type: "row.place",
        title,
        afterRowId: null,
        beforeRowId: null,
        parentRowId: null,
      }),
    );
  await command(`/databases/${host}/commands`, {
    type: "view.create",
    name: "Board",
    viewType: "kanban",
    dataSourceId: source,
    config: { groupPropertyId: status.property.id },
    afterViewId: null,
    beforeViewId: null,
  });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies(
    [...jar.cookies].map(([name, value]) => ({ name, value, url: webOrigin })),
  );
  page = await context.newPage();
  const devtools = measurementFile ? await context.newCDPSession(page) : null;
  if (devtools) {
    await devtools.send("Performance.enable");
    page.on("requestfinished", (request) => {
      const url = new URL(request.url());
      if (url.port !== "1497" && !url.pathname.startsWith("/api/")) return;
      const phase = measurementPhase;
      measurementsPending.push(
        request
          .sizes()
          .then((sizes) =>
            measurements.requests.push({
              phase,
              method: request.method(),
              path: url.pathname,
              query: url.search,
              ...sizes,
            }),
          )
          .catch(() => {}),
      );
    });
  }
  page.setDefaultTimeout(20000);
  const errors = [];
  const navigationTraffic = [];
  page.on("request", (request) => {
    if (request.url().includes("navigation-realtime")) navigationTraffic.push(request.url());
  });
  page.on("websocket", (socket) => {
    if (socket.url().includes("navigation-realtime")) navigationTraffic.push(socket.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("Cannot update a component"))
      errors.push(message.text());
  });
  const startupStart = performance.now();
  await page.goto(`${webOrigin}/d/${host}`);
  await expect(page.getByText("Alpha browser row", { exact: true }).first()).toBeVisible();
  if (devtools) {
    await page.waitForLoadState("networkidle");
    measurements.startupMs = performance.now() - startupStart;
    measurements.heap.push({
      phase: "startup",
      metrics: (await devtools.send("Performance.getMetrics")).metrics.filter(
        ({ name }) => name === "JSHeapUsedSize",
      ),
    });
    measurementPhase = "interactions";
  }
  console.info("Signed-in application loaded real PostgreSQL records.");
  await page.getByText("Board", { exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByText("Alpha browser row", { exact: true }).first()).toBeVisible();
  console.info("Real Kanban view loaded.");
  const peerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await peerContext.addCookies(
    [...jar.cookies].map(([name, value]) => ({ name, value, url: webOrigin })),
  );
  const peer = await peerContext.newPage();
  const peerFrames = [];
  peer.on("pageerror", (error) => errors.push(error.message));
  peer.on("websocket", (socket) => {
    if (!socket.url().includes("database-collaboration")) return;
    socket.on("framereceived", ({ payload }) => {
      try {
        peerFrames.push(JSON.parse(String(payload)));
      } catch {}
    });
  });
  await peer.goto(`${webOrigin}/d/${host}`);
  const peerAlpha = peer
    .locator("tr[data-database-row-id]")
    .filter({ hasText: "Alpha browser row" })
    .getByRole("checkbox", { name: "Done value" });
  await expect(peerAlpha).not.toBeChecked();
  await expect
    .poll(() => peerFrames.some((frame) => frame.type === "realtime.ready"), { timeout: 20000 })
    .toBe(true);
  let release;
  let held = new Promise((resolve) => {
    release = resolve;
  });
  let intercepted = false;
  await page.route(`**${sourcePath}`, async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON().command.type === "row.change"
    ) {
      intercepted = true;
      await held;
    }
    await route.continue();
  });
  const checkedColumn = page
    .locator(".database-kanban-column")
    .filter({ has: page.getByText("Checked", { exact: true }) });
  const alphaCard = page.locator(".database-kanban-card").filter({ hasText: "Alpha browser row" });
  await alphaCard.dragTo(checkedColumn, { targetPosition: { x: 120, y: 60 } });
  await expect.poll(() => intercepted).toBe(true);
  await expect(checkedColumn.getByText("Alpha browser row", { exact: true })).toBeVisible();
  await expect(peerAlpha).not.toBeChecked();
  await page.getByRole("tab", { name: "Table", exact: true }).click();
  await expect(page.getByText("Alpha browser row", { exact: true }).first()).toBeVisible();
  await expect(
    page
      .locator("tr[data-database-row-id]")
      .filter({ hasText: "Alpha browser row" })
      .getByRole("checkbox")
      .last(),
  ).toBeChecked();
  await page.getByRole("tab", { name: "Board", exact: true }).click();
  await expect(checkedColumn.getByText("Alpha browser row", { exact: true })).toBeVisible();
  const saved = page.waitForResponse(
    (response) => response.url().endsWith(sourcePath) && response.request().method() === "POST",
  );
  release();
  assert.ok((await saved).ok());
  await expect(peerAlpha).toBeChecked({ timeout: 20000 });
  assert.ok(
    peerFrames.some((frame) => frame.type === "database.mutation"),
    "Peer must receive a database mutation frame",
  );
  console.info(
    "A second independent browser received the committed drag over realtime without reload.",
  );
  await page.reload();
  await page.getByRole("tab", { name: "Board", exact: true }).click();
  await expect(checkedColumn.getByText("Alpha browser row", { exact: true })).toBeVisible();
  console.info(
    "Native drag projected before transport, survived view switches, and persisted after reload.",
  );
  held = new Promise((resolve) => {
    release = resolve;
  });
  intercepted = false;
  await page.getByRole("tab", { name: "Table", exact: true }).click();
  const betaCheckbox = page
    .locator("tr[data-database-row-id]")
    .filter({ hasText: "Beta browser row" })
    .getByRole("checkbox", { name: "Done value" });
  await betaCheckbox.click();
  await expect.poll(() => intercepted).toBe(true);
  await expect(betaCheckbox).toBeChecked();
  await page.getByRole("tab", { name: "Board", exact: true }).click();
  await expect(checkedColumn.getByText("Beta browser row", { exact: true })).toBeVisible();
  const propertySaved = page.waitForResponse(
    (response) => response.url().endsWith(sourcePath) && response.request().method() === "POST",
  );
  release();
  assert.ok((await propertySaved).ok());
  await expect(
    peer
      .locator("tr[data-database-row-id]")
      .filter({ hasText: "Beta browser row" })
      .getByRole("checkbox", { name: "Done value" }),
  ).toBeChecked({ timeout: 20000 });
  await page.reload();
  await page.getByRole("tab", { name: "Board", exact: true }).click();
  await expect(checkedColumn.getByText("Beta browser row", { exact: true })).toBeVisible();
  console.info(
    "Table property edit projected into Kanban before transport and persisted after reload.",
  );
  const readyFrames = peerFrames.filter((frame) => frame.type === "realtime.ready").length;
  await peerContext.setOffline(true);
  await expect.poll(() => peer.evaluate(() => navigator.onLine)).toBe(false);
  await page.getByRole("tab", { name: "Table", exact: true }).click();
  const gammaSaved = page.waitForResponse(
    (response) => response.url().endsWith(sourcePath) && response.request().method() === "POST",
  );
  await page
    .locator("tr[data-database-row-id]")
    .filter({ hasText: "Gamma browser row" })
    .getByRole("checkbox", { name: "Done value" })
    .click();
  assert.ok((await gammaSaved).ok());
  await peerContext.setOffline(false);
  await expect
    .poll(() => peerFrames.filter((frame) => frame.type === "realtime.ready").length, {
      timeout: 20000,
    })
    .toBeGreaterThan(readyFrames);
  await expect(
    peer
      .locator("tr[data-database-row-id]")
      .filter({ hasText: "Gamma browser row" })
      .getByRole("checkbox", { name: "Done value" }),
  ).toBeChecked({ timeout: 20000 });
  console.info(
    "Disconnected peer caught up after reconnect without reloading or replaying writes.",
  );
  if (devtools)
    measurements.heap.push({
      phase: "after-baseline-interactions",
      metrics: (await devtools.send("Performance.getMetrics")).metrics.filter(
        ({ name }) => name === "JSHeapUsedSize",
      ),
    });
  measurementPhase = "shared-page-metadata";
  const alphaPageId = createdRows[0].pageId;
  const favorite = await api.requestJson(`/pages/${alphaPageId}/favorite`, { jar, method: "PUT" });
  assert.ok(favorite.response.ok);
  await page.reload();
  await expect(
    page.locator("tr[data-database-row-id]").filter({ hasText: "Alpha browser row" }),
  ).toBeVisible();
  const alphaRow = page
    .locator("tr[data-database-row-id]")
    .filter({ hasText: "Alpha browser row" });
  await alphaRow.locator(".database-page-link").hover();
  await alphaRow.getByRole("button", { name: "Open Alpha browser row", exact: true }).click();
  const paneTitle = page.getByRole("textbox", { name: "Page title", exact: true }).last();
  await expect(paneTitle).toHaveValue("Alpha browser row");
  await expect(paneTitle).toBeEditable();
  await page.waitForLoadState("networkidle");
  const metadataRequests = [];
  const trackMetadata = (request) => {
    const url = new URL(request.url());
    if (url.port === "1497" || url.pathname.startsWith("/api/"))
      metadataRequests.push({
        method: request.method(),
        path: url.pathname,
        fields: url.searchParams.get("fields"),
      });
  };
  page.on("request", trackMetadata);
  const titleAck = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" && response.url().endsWith(`/pages/${alphaPageId}`),
  );
  void titleAck.catch(() => undefined);
  await paneTitle.fill("Shared browser title");
  await paneTitle.press("Enter");
  assert.ok((await titleAck).ok());
  await expect(
    page.locator("tr[data-database-row-id]").filter({ hasText: "Shared browser title" }),
  ).toBeVisible();
  await expect(
    page
      .locator('a[href*="/p/' + alphaPageId + '"]')
      .filter({ hasText: "Shared browser title" })
      .first(),
  ).toBeVisible();
  await expect(paneTitle).toHaveValue("Shared browser title");
  await page.waitForTimeout(200);
  page.off("request", trackMetadata);
  assert.equal(
    metadataRequests.filter((request) => request.method === "PATCH").length,
    1,
    JSON.stringify(metadataRequests),
  );
  assert.equal(
    metadataRequests.filter(
      (request) =>
        request.method === "GET" &&
        (request.path.endsWith(`/pages/${alphaPageId}`) ||
          (request.path.endsWith("/pages") && request.fields === "nav") ||
          request.path.endsWith("/bootstrap")),
    ).length,
    0,
    JSON.stringify(metadataRequests),
  );
  assert.deepEqual(navigationTraffic, [], "Navigation ticket requests and sockets are retired");
  console.info(
    "Sidebar, database row and page pane share a title acknowledgement with one write and no blanket metadata reads.",
  );
  measurementPhase = "shared-property-definition";
  await page.getByRole("button", { name: "Done property options", exact: true }).click();
  await page.waitForLoadState("networkidle");
  const definitionRequests = [];
  const trackDefinition = (request) => {
    const url = new URL(request.url());
    if (url.port === "1497" || url.pathname.startsWith("/api/"))
      definitionRequests.push({
        method: request.method(),
        path: url.pathname,
        fields: url.searchParams.get("fields"),
      });
  };
  page.on("request", trackDefinition);
  const definitionAck = page.waitForResponse((response) => {
    const request = response.request();
    return (
      request.method() === "POST" &&
      response.url().endsWith("/commands") &&
      request.postDataJSON()?.command?.type === "property.update"
    );
  });
  void definitionAck.catch(() => undefined);
  const propertyName = page.getByRole("textbox", { name: "Property name", exact: true });
  await propertyName.fill("Complete");
  await propertyName.press("Enter");
  assert.ok((await definitionAck).ok());
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Complete property options", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.getByText("Complete", { exact: true }).count())
    .toBeGreaterThanOrEqual(2);
  await expect(
    peer.getByRole("button", { name: "Complete property options", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(200);
  page.off("request", trackDefinition);
  assert.equal(
    definitionRequests.filter(
      (request) => request.method === "POST" && request.path.endsWith("/commands"),
    ).length,
    1,
    JSON.stringify(definitionRequests),
  );
  assert.equal(
    definitionRequests.filter(
      (request) =>
        request.method === "GET" &&
        (request.path.endsWith("/bootstrap") ||
          request.path.endsWith("/properties") ||
          (request.path.endsWith("/pages") && request.fields === "nav")),
    ).length,
    0,
    JSON.stringify(definitionRequests),
  );
  console.info(
    "Database header, page property panel and independent peer share one definition confirmation without blanket reads.",
  );
  const cellTraffic = [];
  const captureCell = (request) => {
    const url = new URL(request.url());
    if (url.origin === apiOrigin)
      cellTraffic.push({
        method: request.method(),
        path: url.pathname,
        fields: url.searchParams.get("fields"),
      });
  };
  page.on("request", captureCell);
  const paneCheckbox = page.getByRole("checkbox", { name: "Complete value", exact: true }).last();
  const cellAck = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith("/commands") &&
      response.request().postDataJSON()?.command?.type === "row.change",
  );
  void cellAck.catch(() => undefined);
  const checked = await paneCheckbox.isChecked();
  await paneCheckbox.click();
  await cellAck;
  const sharedRowCheckbox = page
    .locator("tr[data-database-row-id]")
    .filter({ hasText: "Shared browser title" })
    .getByRole("checkbox")
    .last();
  await expect(sharedRowCheckbox).toBeChecked({ checked: !checked });
  await expect(paneCheckbox).toBeChecked({ checked: !checked });
  await expect(
    peer
      .locator("tr[data-database-row-id]")
      .filter({ hasText: "Shared browser title" })
      .getByRole("checkbox")
      .last(),
  ).toBeChecked({ checked: !checked });
  await page.waitForTimeout(300);
  page.off("request", captureCell);
  assert.equal(
    cellTraffic.filter((request) => request.method === "POST" && request.path.endsWith("/commands"))
      .length,
    1,
  );
  assert.deepEqual(
    cellTraffic.filter(
      (request) =>
        request.method === "GET" &&
        (request.path.endsWith("/bootstrap") ||
          request.path.endsWith("/properties") ||
          request.fields === "nav"),
    ),
    [],
  );
  console.info(
    "Cell, page property panel and independent browser resolve one value acknowledgement without blanket reads.",
  );
  measurementPhase = "yjs-collaboration";
  const bodyText = "Shared Yjs browser body";
  const editor = page.locator('.tiptap[contenteditable="true"]').last();
  await expect(editor).toBeEditable();
  await editor.click();
  await editor.press("ControlOrMeta+End");
  await editor.press("Enter");
  await editor.pressSequentially(bodyText);
  const peerYjsRow = peer
    .locator("tr[data-database-row-id]")
    .filter({ hasText: "Shared browser title" });
  await peerYjsRow.locator(".database-page-link").hover();
  await peerYjsRow.getByRole("button", { name: "Open Shared browser title", exact: true }).click();
  await expect(peer.locator(".tiptap").last()).toContainText(bodyText);
  console.info(
    "Independent page panes share Yjs body edits through existing collaboration sockets.",
  );
  const renamedRow = page
    .locator("tr[data-database-row-id]")
    .filter({ hasText: "Shared browser title" });
  await renamedRow.locator(".database-page-link").hover();
  await renamedRow.getByRole("button", { name: "Close Shared browser title", exact: true }).click();
  await page.getByRole("tab", { name: "Board", exact: true }).click();
  await mkdir(`${root}.dev/database-app-results`, { recursive: true });
  await page.screenshot({ path: `${root}.dev/database-app-results/kanban.png`, fullPage: true });
  measurementPhase = "all-layouts";
  const scheduled = await command(sourcePath, {
    type: "property.create",
    name: "Scheduled",
    propertyType: "date",
    config: {},
    afterPropertyId: null,
    beforePropertyId: null,
  });
  await command(sourcePath, {
    type: "row.change",
    rowId: createdRows[0].id,
    valuesByPropertyId: { [scheduled.property.id]: ["2026-10-05"] },
  });
  for (const type of ["list", "gallery", "timeline", "chart", "form"]) {
    await command(`/databases/${host}/commands`, {
      type: "view.create",
      name: `Proof ${type}`,
      viewType: type,
      dataSourceId: source,
      config:
        type === "timeline"
          ? { datePropertyId: scheduled.property.id }
          : type === "chart"
            ? { chart: { type: "count" } }
            : {},
      afterViewId: null,
      beforeViewId: null,
    });
  }
  const selectView = async (name) => {
    await page.keyboard.press("Escape");
    const tab = page.getByRole("tab", { name, exact: true });
    if (await tab.count()) {
      if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
    } else {
      await page.getByRole("button", { name: /more database views$/ }).click();
      await page.getByRole("menuitem", { name, exact: true }).click();
    }
    const type = name === "Table" ? "table" : name === "Board" ? "kanban" : name.slice(6);
    await expect(page.locator(`[data-database-layout="${type}"]`).first()).toBeVisible();
  };
  // These are actual mounted application layouts backed by the same PostgreSQL source.
  for (const [type, name] of [
    ["table", "Table"],
    ["kanban", "Board"],
    ...["list", "gallery", "timeline", "chart", "form"].map((type) => [type, `Proof ${type}`]),
  ]) {
    await selectView(name);
    const surface = page.locator(`[data-database-layout="${type}"]`).first();
    await expect(surface).toBeVisible();
    if (["table", "kanban", "list", "gallery", "timeline"].includes(type))
      await expect(
        surface.getByText("Shared browser title", { exact: true }).first(),
      ).toBeVisible();
    if (type === "chart")
      await expect(surface.getByText("3", { exact: true }).first()).toBeVisible();
    if (type === "form")
      await expect(surface.getByText("Scheduled", { exact: true }).first()).toBeVisible();
  }
  console.info(
    "All seven mounted layouts resolve current shared entities and server-authoritative records.",
  );

  measurementPhase = "rejected-write";
  await selectView("Table");
  const rejectedCell = page
    .locator("tr[data-database-row-id]")
    .filter({ hasText: "Beta browser row" })
    .getByRole("checkbox")
    .first();
  const confirmedChecked = await rejectedCell.isChecked();
  let rejectedRequests = 0;
  const rejectCell = async (route) => {
    rejectedRequests++;
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ error: "Fixture rejected write" }),
    });
  };
  await page.route(`**${sourcePath}`, rejectCell);
  const rejectedResponse = page.waitForResponse(
    (response) => response.url().endsWith(sourcePath) && response.request().method() === "POST",
  );
  await rejectedCell.click();
  assert.equal((await rejectedResponse).status(), 409);
  await expect.poll(() => rejectedCell.isChecked()).toBe(confirmedChecked);
  assert.equal(rejectedRequests, 1);
  await page.unroute(`**${sourcePath}`, rejectCell);
  console.info(
    "A mounted cell rolls back a rejected normal write and retains its confirmed value.",
  );

  measurementPhase = "focus-recovery";
  const otherPage = await api.requestJson("/pages", {
    jar,
    method: "POST",
    body: {
      workspaceId: setup.data.workspaceId,
      name: "Focus recovery page",
      type: "pageblock",
      url: "#",
      content: null,
      metadata: {},
    },
  });
  assert.ok(otherPage.response.ok);
  await expect(peer.getByText("Focus recovery page", { exact: true })).toHaveCount(0);
  const focusedRead = peer.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.pathname.endsWith("/pages") &&
      url.searchParams.get("fields") === "nav"
    );
  });
  void focusedRead.catch(() => undefined);
  await peer.bringToFront();
  await peer.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  assert.ok((await focusedRead).ok());
  await expect(peer.getByText("Focus recovery page", { exact: true }).first()).toBeVisible();
  assert.deepEqual(navigationTraffic, []);
  console.info(
    "A different client's plain page/hierarchy update recovers on focus without navigation tickets or sockets.",
  );

  if (devtools) {
    const cacheSnapshot = () =>
      page.evaluate(async (root) => {
        const { queryClient } = await import("/src/app/query-client.ts");
        const { sharedClient } = await import(`/@fs/${root}packages/features/src/data/index.ts`);
        return {
          queries: queryClient.getQueryCache().getAll().length,
          scopes: sharedClient(queryClient)
            .all()
            .map((owner) => ({
              kind: owner.session.scope.viewer.kind,
              pages: owner.pages.collection.base.size,
              records: owner.databases.records.collection.base.size,
              definitions: owner.databases.definitions.collection.base.size,
              values: owner.databases.values.collection.base.size,
            })),
        };
      }, root);
    await page.bringToFront();
    await page.waitForLoadState("networkidle");
    await devtools.send("HeapProfiler.collectGarbage");
    measurements.heap.push({
      phase: "retained-before-mount-cycles",
      forcedGC: true,
      metrics: (await devtools.send("Performance.getMetrics")).metrics.filter(
        ({ name }) => name === "JSHeapUsedSize",
      ),
    });
    measurements.cache.push({ phase: "before-mount-cycles", ...(await cacheSnapshot()) });
    measurementPhase = "mount-cycles";
    for (let cycle = 0; cycle < 5; cycle++)
      for (const name of [
        "Table",
        "Board",
        "Proof list",
        "Proof gallery",
        "Proof timeline",
        "Proof chart",
        "Proof form",
      ])
        await selectView(name);
    await page.waitForLoadState("networkidle");
    await devtools.send("HeapProfiler.collectGarbage");
    measurements.heap.push({
      phase: "retained-after-mount-cycles",
      forcedGC: true,
      metrics: (await devtools.send("Performance.getMetrics")).metrics.filter(
        ({ name }) => name === "JSHeapUsedSize",
      ),
    });
    measurements.cache.push({ phase: "after-mount-cycles", ...(await cacheSnapshot()) });
    assert.deepEqual(
      measurements.cache[1].scopes,
      measurements.cache[0].scopes,
      "Repeated mount cycles must not accumulate canonical entities",
    );
  }
  assert.deepEqual(errors, []);
  assert.ok(
    !serverLog.includes('"event":"background.node_lane_operation"'),
    "Background lane operations must not fail",
  );
  if (devtools) {
    measurements.heap.push({
      phase: "after-view-switches-and-reloads",
      metrics: (await devtools.send("Performance.getMetrics")).metrics.filter(
        ({ name }) => name === "JSHeapUsedSize",
      ),
    });
    await Promise.all(measurementsPending);
    await writeFile(measurementFile, JSON.stringify(measurements, null, 2));
  }
  console.info("Passed signed-in application browser verification.");
} catch (error) {
  if (page) {
    console.error(
      "Navigation query diagnostics:",
      await page
        .evaluate(async () => {
          const { queryClient } = await import("/src/app/query-client.ts");
          return queryClient
            .getQueryCache()
            .findAll({ queryKey: ["pages"] })
            .map((query) => ({
              key: query.queryKey,
              status: query.state.status,
              error: query.state.error?.message ?? null,
              issues: query.state.error?.issues,
              pages: query.state.data?.pages?.length,
              databases: query.state.data?.databases?.length,
            }));
        })
        .catch(() => []),
    );
    console.error(
      (
        await page
          .locator("body")
          .innerText()
          .catch(() => "")
      ).slice(0, 4000),
    );
    await mkdir(`${root}.dev/database-app-results`, { recursive: true });
    await page
      .screenshot({ path: `${root}.dev/database-app-results/failure.png`, fullPage: true })
      .catch(() => {});
  }
  console.error("Application fixture failed:", error);
  console.error(serverLog.replaceAll(/(postgres|redis):\/\/\S+/g, "$1://[test service]"));
  throw error;
} finally {
  await browser?.close();
  await vite?.close();
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => server.once("exit", resolve)), setTimeout(5000)]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  for (const name of containers.reverse()) await exec("docker", ["stop", "--time", "1", name]);
  console.info("Removed isolated browser-test services; development data was untouched.");
}
