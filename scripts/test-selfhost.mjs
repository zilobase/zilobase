#!/usr/bin/env node

import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import process from "node:process"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const projectName = `zilobase-selfhost-test-${process.pid}-${Date.now()}`
const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "zilobase-selfhost-"))
const envFile = path.join(tempDirectory, "selfhost.env")
let bootstrapToken = ""
const password = `Test-${secret(18)}`
const ownerEmail = `owner-${Date.now()}@zilobase.local`
const inviteEmail = `invite-${Date.now()}@zilobase.local`
const httpPort = await getFreePort()
const minioPort = await getFreePort()
const mailpitPort = await getFreePort()
const serverOrigin = `http://127.0.0.1:${httpPort}`
const mailpitOrigin = `http://127.0.0.1:${mailpitPort}`
let resetCompleted = false

class CookieJar {
  cookies = new Map()

  header() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ")
  }

  store(headers) {
    const values = headers.getSetCookie?.() ?? splitSetCookie(headers.get("set-cookie"))
    for (const value of values) {
      const cookie = value.split(";", 1)[0]
      const separator = cookie.indexOf("=")
      if (separator > 0) this.cookies.set(cookie.slice(0, separator), cookie.slice(separator + 1))
    }
  }
}

try {
  console.info("Checking that production Compose rejects missing secrets...")
  const missingSecrets = await capture("docker", [
    "compose",
    "--env-file",
    "/dev/null",
    "-f",
    "docker-compose.yml",
    "config",
  ], { env: scrubSelfhostEnvironment(process.env) })
  assert.notEqual(missingSecrets.code, 0, "production Compose accepted missing secrets")

  console.info("Starting a fresh isolated self-hosted stack...")
  await selfhost("up")
  const generatedEnvironment = parseEnv(await readFile(envFile, "utf8"))
  bootstrapToken = generatedEnvironment.ZILOBASE_BOOTSTRAP_TOKEN
  assert.ok(bootstrapToken?.length >= 32)
  assert.ok(generatedEnvironment.BETTER_AUTH_SECRET?.length >= 32)
  assert.equal((await stat(envFile)).mode & 0o777, 0o600)

  const ready = await fetch(`${serverOrigin}/ready`)
  assert.equal(ready.status, 200)
  const initialDiscovery = await json(`${serverOrigin}/.well-known/zilobase`)
  assert.equal(initialDiscovery.apiOrigin, serverOrigin)

  const bootstrap = await requestJson(`${serverOrigin}/api/instance/bootstrap`, {
    body: {
      email: ownerEmail,
      name: "Self-host Test Owner",
      password,
      workspaceName: "Self-host Test Workspace",
    },
    headers: { "x-zilobase-bootstrap-token": bootstrapToken },
    method: "POST",
  })
  assert.equal(bootstrap.response.status, 201)
  assert.equal(bootstrap.data.registrationMode, "invite-only")

  const jar = new CookieJar()
  const signIn = await requestJson(`${serverOrigin}/api/auth/sign-in/email`, {
    body: { email: ownerEmail, password },
    jar,
    method: "POST",
  })
  assert.equal(signIn.response.status, 200)

  console.info("Checking Mailpit OTP and invitation delivery...")
  const otpRequest = await requestJson(
    `${serverOrigin}/api/auth/email-otp/send-verification-otp`,
    {
      body: { email: ownerEmail, type: "sign-in" },
      method: "POST",
    },
  )
  assert.equal(otpRequest.response.status, 200)
  const otpMessage = await waitForMessage(ownerEmail)
  assert.match(otpMessage, /\b\d{6}\b/)

  const invitation = await requestJson(
    `${serverOrigin}/api/auth/workspace/invite-member`,
    {
      body: {
        email: inviteEmail,
        role: "member",
        workspaceId: bootstrap.data.workspaceId,
      },
      jar,
      method: "POST",
    },
  )
  assert.equal(invitation.response.status, 200)
  const invitationMessage = await waitForMessage(inviteEmail)
  assert.match(invitationMessage, /accept-invitation/i)

  console.info("Uploading and reading a MinIO-backed profile image...")
  const imageBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  )
  const uploadRequest = await requestJson(
    `${serverOrigin}/user-settings/profile/image/uploads`,
    {
      body: {
        byteSize: imageBytes.byteLength,
        contentType: "image/png",
        filename: "selfhost-test.png",
      },
      jar,
      method: "POST",
    },
  )
  assert.equal(uploadRequest.response.status, 200)
  assert.equal(new URL(uploadRequest.data.upload.url).origin, `http://127.0.0.1:${minioPort}`)

  const objectUpload = await fetch(uploadRequest.data.upload.url, {
    body: imageBytes,
    headers: uploadRequest.data.upload.headers,
    method: "PUT",
  })
  assert.equal(objectUpload.status, 200)

  const completedImage = await requestJson(
    `${serverOrigin}/user-settings/profile/image/uploads/${uploadRequest.data.image.id}/complete`,
    {
      body: {
        byteSize: imageBytes.byteLength,
        contentType: "image/png",
        filename: "selfhost-test.png",
      },
      jar,
      method: "POST",
    },
  )
  assert.equal(completedImage.response.status, 200)
  const imageRead = await fetch(`${serverOrigin}${completedImage.data.image}`, {
    headers: { cookie: jar.header() },
  })
  assert.equal(imageRead.status, 200)
  assert.deepEqual(Buffer.from(await imageRead.arrayBuffer()), imageBytes)

  const uid = await captureCompose([
    "exec",
    "-T",
    "zilobase",
    "node",
    "-e",
    "process.stdout.write(String(process.getuid?.()))",
  ])
  assert.equal(uid.code, 0)
  assert.notEqual(uid.stdout.trim(), "0", "application container is running as root")

  console.info("Restarting through selfhost:down/up to verify volume persistence...")
  await selfhost("down")
  const databaseVolume = `${projectName}_postgres_data`
  const preservedVolume = await capture("docker", ["volume", "inspect", databaseVolume])
  assert.equal(preservedVolume.code, 0, "selfhost:down removed the database volume")
  await selfhost("up")

  const discoveryAfterRestart = await json(`${serverOrigin}/.well-known/zilobase`)
  assert.equal(discoveryAfterRestart.instanceId, initialDiscovery.instanceId)
  const restartJar = new CookieJar()
  const signInAfterRestart = await requestJson(
    `${serverOrigin}/api/auth/sign-in/email`,
    { body: { email: ownerEmail, password }, jar: restartJar, method: "POST" },
  )
  assert.equal(signInAfterRestart.response.status, 200)
  const persistedImage = await fetch(`${serverOrigin}${completedImage.data.image}`, {
    headers: { cookie: restartJar.header() },
  })
  assert.equal(persistedImage.status, 200)
  assert.deepEqual(Buffer.from(await persistedImage.arrayBuffer()), imageBytes)

  console.info("Running the explicitly destructive selfhost:reset path...")
  await selfhost("reset", "--yes")
  resetCompleted = true
  const removedVolume = await capture("docker", ["volume", "inspect", databaseVolume])
  assert.notEqual(removedVolume.code, 0, "selfhost:reset preserved the database volume")

  console.info("Self-host integration test passed.")
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  const logs = await captureCompose(["logs", "--no-color", "--tail", "200"])
  if (logs.stdout) console.error(sanitize(logs.stdout))
  if (logs.stderr) console.error(sanitize(logs.stderr))
  process.exitCode = 1
} finally {
  if (!resetCompleted) {
    await captureCompose(["down", "--volumes", "--remove-orphans"])
  }
  await rm(tempDirectory, { force: true, recursive: true })
}

async function selfhost(...args) {
  return run(process.execPath, ["scripts/selfhost.mjs", ...args], {
    env: {
      ...process.env,
      ZILOBASE_SELFHOST_ENV_FILE: envFile,
      ZILOBASE_SELFHOST_PROJECT_NAME: projectName,
      ZILOBASE_DEV_HTTP_PORT: String(httpPort),
      MINIO_DEV_API_PORT: String(minioPort),
      MAILPIT_DEV_UI_PORT: String(mailpitPort),
    },
  })
}

function composeArguments(args) {
  return [
    "compose",
    "--project-name",
    projectName,
    "--env-file",
    envFile,
    "-f",
    "docker-compose.yml",
    "-f",
    "docker-compose.dev.yml",
    "--profile",
    "dev",
    ...args,
  ]
}

function captureCompose(args) {
  return capture("docker", composeArguments(args))
}

async function waitForMessage(recipient) {
  const deadline = Date.now() + 20_000

  while (Date.now() < deadline) {
    const response = await fetch(`${mailpitOrigin}/api/v1/messages`)
    if (response.ok) {
      const mailbox = await response.json()
      const messages = Array.isArray(mailbox.messages) ? mailbox.messages : []
      const match = messages.find((message) =>
        JSON.stringify(message).toLowerCase().includes(recipient.toLowerCase()),
      )
      const id = match?.ID ?? match?.Id ?? match?.id

      if (id) {
        const detail = await fetch(`${mailpitOrigin}/api/v1/message/${encodeURIComponent(id)}`)
        if (detail.ok) return JSON.stringify(await detail.json())
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`Mailpit did not receive the expected message for ${recipient}`)
}

async function requestJson(url, { body, headers = {}, jar, method }) {
  const requestHeaders = new Headers(headers)
  requestHeaders.set("content-type", "application/json")
  requestHeaders.set("origin", serverOrigin)
  if (jar?.header()) requestHeaders.set("cookie", jar.header())

  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: requestHeaders,
    method,
  })
  jar?.store(response.headers)
  const text = await response.text()
  const data = text ? JSON.parse(text) : null

  if (!response.ok) {
    throw new Error(`${method} ${new URL(url).pathname} failed with ${response.status}: ${text}`)
  }

  return { data, response }
}

async function json(url) {
  const response = await fetch(url)
  assert.equal(response.status, 200)
  return response.json()
}

function splitSetCookie(value) {
  return value ? value.split(/,(?=\s*[^;,]+=)/g).map((item) => item.trim()) : []
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      const port = typeof address === "object" && address ? address.port : null
      server.close((error) => (error || port === null ? reject(error) : resolve(port)))
    })
  })
}

function run(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: repositoryRoot,
      stdio: "inherit",
      ...options,
    })
    child.once("error", reject)
    child.once("exit", (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${executable} exited with ${signal || code}`))
    })
  })
}

function capture(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: repositoryRoot,
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.once("error", reject)
    child.once("exit", (code) => resolve({ code, stderr, stdout }))
  })
}

function scrubSelfhostEnvironment(environment) {
  const next = { ...environment }
  for (const key of [
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "CLIENT_URL",
    "EMAIL_FROM",
    "MINIO_BUCKET",
    "MINIO_ROOT_PASSWORD",
    "MINIO_ROOT_USER",
    "POSTGRES_DB",
    "POSTGRES_PASSWORD",
    "POSTGRES_USER",
    "S3_PUBLIC_ENDPOINT",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "ZILOBASE_BOOTSTRAP_TOKEN",
    "ZILOBASE_IMAGE",
    "ZILOBASE_SITE_ADDRESS",
    "ZILOBASE_STORAGE_SITE_ADDRESS",
  ]) delete next[key]
  return next
}

function parseEnv(contents) {
  return Object.fromEntries(
    contents
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=")
        return [line.slice(0, separator), line.slice(separator + 1)]
      }),
  )
}

function sanitize(value) {
  const redacted = bootstrapToken
    ? value.replaceAll(bootstrapToken, "[REDACTED]")
    : value

  return redacted
    .replaceAll(password, "[REDACTED]")
    .replace(/([?&](?:X-Amz-[^=]+|x-id)=[^&\s]+)/gi, "[SIGNED_QUERY_REDACTED]")
}

function secret(bytes) {
  return randomBytes(bytes).toString("base64url")
}
