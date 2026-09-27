#!/usr/bin/env node

// Runs inside the deployed pod, so it may only import sibling modules copied
// alongside it; see scripts/selfhost/api-conformance.mjs.

import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { CookieJar, createApiClient } from "./api-conformance.mjs";

const internalOrigin = process.env.ZILOBASE_HELM_TEST_ORIGIN || "http://127.0.0.1:3000";
const publicOrigin = process.env.ZILOBASE_HELM_PUBLIC_ORIGIN || "https://community.ga.invalid";
const statePath = process.env.ZILOBASE_HELM_STATE_PATH || "/tmp/zilobase-community-helm-state.json";
const mode = process.argv[2];

const api = createApiClient({ internalOrigin, publicOrigin });

if (mode === "seed") await seed();
else if (mode === "verify") await verify();
else throw new Error("Usage: node scripts/selfhost/test-community-helm.mjs <seed|verify>");

async function seed() {
  const bootstrapToken = required("ZILOBASE_BOOTSTRAP_TOKEN");
  const email = `community-helm-${Date.now()}@zilobase.local`;
  const password = `Community-${randomBytes(18).toString("base64url")}`;

  const ready = await api.ready();
  assert.deepEqual(ready, {
    checks: { database: "ok", objectStorage: "ok", realtime: "ok" },
    ok: true,
    service: "zilobase-server",
  });
  const discovery = await api.getJson("/.well-known/zilobase");
  assert.equal(
    discovery.apiOrigin,
    publicOrigin,
    "discovery did not advertise the external origin",
  );

  const bootstrap = await api.bootstrapInstance({
    bootstrapToken,
    email,
    name: "Community Helm Owner",
    password,
    workspaceName: "Community Helm Workspace",
  });
  await api.assertBootstrapTokenIsSingleUse({
    bootstrapToken,
    email,
    password,
    workspaceName: "Community Helm Workspace",
  });

  const jar = new CookieJar();
  await api.signIn({ email, jar, password });
  const userId = await api.sessionUserId({ cookie: jar.header() });

  const pageId = await api.createPage(jar, {
    name: "Community Helm probe",
    workspaceId: bootstrap.data.workspaceId,
  });
  await api.renamePage(jar, pageId, "Community Helm probe updated");

  const session = await api.createDesktopSession(jar);
  const collaboration = await api.collaborationTicket(jar, pageId);
  await api.openCollaborationSocket({
    accessToken: session.access_token,
    websocketUrl: collaboration.websocketUrl,
  });

  const { imagePath } = await api.uploadProfileImage(jar, { filename: "community.png" });
  const image = await api.readProfileImage({ cookie: jar.header(), imagePath });
  api.assertProbeImage(image);

  const state = {
    cookie: jar.header(),
    email,
    imageHash: createHash("sha256").update(image).digest("hex"),
    imagePath,
    instanceId: discovery.instanceId,
    pageId,
    password,
    userId,
  };
  await writeFile(statePath, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  console.log(
    JSON.stringify({
      bootstrap: "single-use",
      image: "ok",
      page: "created-and-edited",
      ready: "ok",
      websocket: "upgraded",
    }),
  );
}

async function verify() {
  const state = JSON.parse(await readFile(statePath, "utf8"));
  const ready = await api.ready();
  assert.equal(ready.ok, true, "the restored instance was not ready");
  const discovery = await api.getJson("/.well-known/zilobase");
  assert.equal(discovery.instanceId, state.instanceId, "the instance identity changed");
  assert.equal(
    await api.sessionUserId({ cookie: state.cookie }),
    state.userId,
    "the session did not survive the restore",
  );
  const page = await api.readPage(state.cookie, state.pageId);
  assert.equal(page.name, "Community Helm probe updated", "the page did not survive the restore");
  const image = await api.readProfileImage({ cookie: state.cookie, imagePath: state.imagePath });
  assert.equal(
    createHash("sha256").update(image).digest("hex"),
    state.imageHash,
    "the restored object did not match the backed-up digest",
  );
  console.log(
    JSON.stringify({ image: "restored", page: "restored", ready: "ok", session: "restored" }),
  );
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
