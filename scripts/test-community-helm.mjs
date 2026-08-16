#!/usr/bin/env node

import assert from "node:assert/strict"
import { createHash, randomBytes } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"

const internalOrigin = process.env.ZILOBASE_HELM_TEST_ORIGIN || "http://127.0.0.1:3000"
const publicOrigin = process.env.ZILOBASE_HELM_PUBLIC_ORIGIN || "https://community.ga.invalid"
const statePath = process.env.ZILOBASE_HELM_STATE_PATH || "/tmp/zilobase-community-helm-state.json"
const mode = process.argv[2]

class CookieJar {
  cookies = new Map()

  header() {
    return [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; ")
  }

  store(headers) {
    for (const value of headers.getSetCookie?.() ?? []) {
      const cookie = value.split(";", 1)[0]
      const separator = cookie.indexOf("=")
      if (separator > 0) this.cookies.set(cookie.slice(0, separator), cookie.slice(separator + 1))
    }
  }
}

if (mode === "seed") await seed()
else if (mode === "verify") await verify()
else throw new Error("Usage: node scripts/test-community-helm.mjs <seed|verify>")

async function seed() {
  const bootstrapToken = required("ZILOBASE_BOOTSTRAP_TOKEN")
  const email = `community-helm-${Date.now()}@zilobase.local`
  const password = `Community-${randomBytes(18).toString("base64url")}`
  const ready = await fetch(`${internalOrigin}/ready`)
  assert.equal(ready.status, 200)
  assert.deepEqual(await ready.json(), {
    checks: { database: "ok", objectStorage: "ok" },
    ok: true,
    service: "zilobase-server",
  })
  const discovery = await getJson("/.well-known/zilobase")
  assert.equal(discovery.apiOrigin, publicOrigin)

  const bootstrap = await requestJson("/api/instance/bootstrap", {
    body: { email, name: "Community Helm Owner", password, workspaceName: "Community Helm Workspace" },
    headers: { "x-zilobase-bootstrap-token": bootstrapToken },
    method: "POST",
  })
  assert.equal(bootstrap.response.status, 201)
  const duplicate = await fetch(`${internalOrigin}/api/instance/bootstrap`, {
    body: JSON.stringify({ email, name: "Duplicate", password, workspaceName: "Duplicate" }),
    headers: {
      "content-type": "application/json",
      origin: publicOrigin,
      "x-zilobase-bootstrap-token": bootstrapToken,
    },
    method: "POST",
  })
  assert.equal(duplicate.status, 409)

  const jar = new CookieJar()
  await requestJson("/api/auth/sign-in/email", { body: { email, password }, jar, method: "POST" })
  const session = await requestJson("/session", { jar })
  const userId = session.data.user?.id ?? session.data.userId
  assert.ok(userId)

  const page = await requestJson("/pages", {
    body: {
      content: null,
      name: "Community Helm probe",
      type: "pageblock",
      url: "#",
      workspaceId: bootstrap.data.workspaceId,
    },
    jar,
    method: "POST",
  })
  const pageId = page.data.page.id
  const updated = await requestJson(`/pages/${pageId}`, {
    body: { name: "Community Helm probe updated" },
    jar,
    method: "PATCH",
  })
  assert.equal(updated.data.page.name, "Community Helm probe updated")

  const accessToken = await createDesktopSession(jar)
  const collaboration = await requestJson(`/pages/${pageId}/collaboration-ticket`, {
    body: {},
    jar,
    method: "POST",
  })
  await verifyWebSocket(collaboration.data.websocketUrl, accessToken)

  const imageBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  )
  const upload = await requestJson("/user-settings/profile/image/uploads", {
    body: { byteSize: imageBytes.byteLength, contentType: "image/png", filename: "community.png" },
    jar,
    method: "POST",
  })
  const put = await fetch(upload.data.upload.url, {
    body: imageBytes,
    headers: upload.data.upload.headers,
    method: "PUT",
  })
  assert.equal(put.status, 200)
  const complete = await requestJson(
    `/user-settings/profile/image/uploads/${upload.data.image.id}/complete`,
    {
      body: { byteSize: imageBytes.byteLength, contentType: "image/png", filename: "community.png" },
      jar,
      method: "POST",
    },
  )
  await assertImage(complete.data.image, jar.header(), imageBytes)

  const state = {
    cookie: jar.header(),
    email,
    imageHash: createHash("sha256").update(imageBytes).digest("hex"),
    imagePath: complete.data.image,
    instanceId: discovery.instanceId,
    pageId,
    password,
    userId,
  }
  await writeFile(statePath, `${JSON.stringify(state)}\n`, { mode: 0o600 })
  console.log(JSON.stringify({
    bootstrap: "single-use",
    image: "ok",
    page: "created-and-edited",
    ready: "ok",
    websocket: "upgraded",
  }))
}

async function verify() {
  const state = JSON.parse(await readFile(statePath, "utf8"))
  const ready = await fetch(`${internalOrigin}/ready`)
  assert.equal(ready.status, 200)
  const discovery = await getJson("/.well-known/zilobase")
  assert.equal(discovery.instanceId, state.instanceId)
  const session = await fetch(`${internalOrigin}/session`, { headers: { cookie: state.cookie } })
  assert.equal(session.status, 200)
  const sessionBody = await session.json()
  assert.equal(sessionBody.user?.id ?? sessionBody.userId, state.userId)
  const page = await requestJson(`/pages/${state.pageId}`, { cookie: state.cookie })
  assert.equal(page.data.page.name, "Community Helm probe updated")
  const image = await fetch(`${internalOrigin}${state.imagePath}`, { headers: { cookie: state.cookie } })
  assert.equal(image.status, 200)
  assert.equal(
    createHash("sha256").update(Buffer.from(await image.arrayBuffer())).digest("hex"),
    state.imageHash,
  )
  console.log(JSON.stringify({ image: "restored", page: "restored", ready: "ok", session: "restored" }))
}

async function createDesktopSession(jar) {
  const verifier = randomBytes(48).toString("base64url")
  const state = randomBytes(32).toString("base64url")
  const redirectUri = "http://127.0.0.1:43123/oauth/callback"
  const authorization = new URLSearchParams({
    client_id: "zilobase-desktop",
    code_challenge: createHash("sha256").update(verifier, "ascii").digest("base64url"),
    code_challenge_method: "S256",
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  })
  const consentPage = await fetch(`${internalOrigin}/desktop/authorize?${authorization}`, {
    headers: { cookie: jar.header() },
  })
  assert.equal(consentPage.status, 200)
  const consentToken = (await consentPage.text()).match(
    /name="consent_token" value="([A-Za-z0-9._-]+)"/,
  )?.[1]
  assert.ok(consentToken)
  authorization.set("consent_token", consentToken)
  authorization.set("decision", "allow")
  const consent = await fetch(`${internalOrigin}/desktop/authorize/consent`, {
    body: authorization,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: jar.header(),
      origin: "null",
    },
    method: "POST",
    redirect: "manual",
  })
  assert.equal(consent.status, 303)
  const code = new URL(consent.headers.get("location")).searchParams.get("code")
  assert.ok(code)
  const token = await fetch(`${internalOrigin}/api/auth/desktop/token`, {
    body: new URLSearchParams({
      client_id: "zilobase-desktop",
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
    headers: { "content-type": "application/x-www-form-urlencoded", origin: publicOrigin },
    method: "POST",
  })
  assert.equal(token.status, 200)
  return (await token.json()).access_token
}

async function verifyWebSocket(ticketUrl, accessToken) {
  const websocketUrl = new URL(ticketUrl)
  const internal = new URL(internalOrigin)
  websocketUrl.protocol = internal.protocol === "https:" ? "wss:" : "ws:"
  websocketUrl.hostname = internal.hostname
  websocketUrl.port = internal.port
  const encodedSession = Buffer.from(accessToken, "utf8").toString("base64url")
  const socket = new WebSocket(websocketUrl, [
    "zilobase.collaboration.v1",
    `zilobase.session.v1.${encodedSession}`,
  ])
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("WebSocket timeout")), 15_000)
    socket.addEventListener("open", () => { clearTimeout(timeout); resolve() }, { once: true })
    socket.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("WebSocket failed")) }, { once: true })
  })
  socket.close()
}

async function assertImage(path, cookie, expected) {
  const response = await fetch(`${internalOrigin}${path}`, { headers: { cookie } })
  assert.equal(response.status, 200)
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected)
}

async function getJson(path) {
  const response = await fetch(`${internalOrigin}${path}`)
  assert.equal(response.status, 200)
  return response.json()
}

async function requestJson(path, { body, cookie, headers = {}, jar, method = "GET" } = {}) {
  const response = await fetch(`${internalOrigin}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      origin: publicOrigin,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
      ...(jar?.header() ? { cookie: jar.header() } : {}),
      ...headers,
    },
    method,
  })
  jar?.store(response.headers)
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) throw new Error(`${method} ${path} failed ${response.status}: ${text}`)
  return { data, response }
}

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}
