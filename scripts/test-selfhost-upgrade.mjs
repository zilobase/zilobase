#!/usr/bin/env node

import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import process from "node:process"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

class CookieJar {
  cookies = new Map()
  header() {
    return [...this.cookies]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ")
  }
  store(headers) {
    const values =
      headers.getSetCookie?.() ?? splitSetCookie(headers.get("set-cookie"))
    for (const value of values) {
      const cookie = value.split(";", 1)[0]
      const separator = cookie.indexOf("=")
      if (separator > 0)
        this.cookies.set(
          cookie.slice(0, separator),
          cookie.slice(separator + 1),
        )
    }
  }
}

const previousImage = required("ZILOBASE_PREVIOUS_IMAGE")
const currentImage = required("ZILOBASE_CURRENT_IMAGE")
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
)
const projectName =
  process.env.ZILOBASE_SELFHOST_PROJECT_NAME ||
  `zilobase-upgrade-${process.pid}-${Date.now()}`
const temporaryDirectory = await mkdtemp(
  path.join(os.tmpdir(), "zilobase-upgrade-"),
)
const envFile = path.resolve(
  process.env.ZILOBASE_SELFHOST_ENV_FILE ||
    path.join(temporaryDirectory, "selfhost.env"),
)
const httpPort = await freePort()
const minioPort = await freePort()
const mailpitPort = await freePort()
const origin = `http://127.0.0.1:${httpPort}`
const email = `upgrade-${Date.now()}@zilobase.local`
const password = `Upgrade-${secret(18)}`
const jar = new CookieJar()

await writeEnvironment()

try {
  console.info(`Starting previous release image ${previousImage}...`)
  await compose(previousImage, ["up", "-d", "--no-build", "--wait"])

  await requestJson("/api/auth/sign-up/email", {
    body: { callbackURL: "/onboarding", email, name: "Upgrade Test", password },
    jar,
    method: "POST",
  })
  await requestJson("/api/auth/email-otp/send-verification-otp", {
    body: { email, type: "email-verification" },
    method: "POST",
  })
  const message = await waitForMessage(email)
  const otp = message.match(/\b\d{6}\b/)?.[0]
  assert.ok(otp, "previous release did not deliver an email verification OTP")
  await requestJson("/api/auth/email-otp/verify-email", {
    body: { email, otp },
    jar,
    method: "POST",
  })
  const workspace = await requestJson("/api/auth/workspace/create", {
    body: { name: "Upgrade Workspace", slug: `upgrade-${Date.now()}` },
    jar,
    method: "POST",
  })
  const page = await requestJson("/pages", {
    body: { name: "Created before upgrade", workspaceId: workspace.data.id },
    jar,
    method: "POST",
  })

  console.info(
    `Recreating the application with current image ${currentImage}...`,
  )
  await compose(currentImage, [
    "up",
    "-d",
    "--no-build",
    "--wait",
    "--force-recreate",
    "zilobase",
    "caddy",
  ])
  const ready = await fetch(`${origin}/ready`)
  assert.equal(ready.status, 200)

  const session = await requestJson("/api/auth/get-session", {
    jar,
    method: "GET",
  })
  assert.equal(session.response.status, 200)
  assert.equal(session.data.user.email, email)
  const persistedPage = await requestJson(`/pages/${page.data.page.id}`, {
    jar,
    method: "GET",
  })
  assert.equal(persistedPage.data.page.name, "Created before upgrade")
  console.info(
    "Previous-release data and session survived the current migration.",
  )
} catch (error) {
  const logs = await captureCompose(currentImage, [
    "logs",
    "--no-color",
    "--tail",
    "200",
  ])
  if (logs.stdout) console.error(sanitize(logs.stdout))
  if (logs.stderr) console.error(sanitize(logs.stderr))
  throw error
} finally {
  await captureCompose(currentImage, ["down", "--volumes", "--remove-orphans"])
  await rm(temporaryDirectory, { force: true, recursive: true })
}

async function writeEnvironment() {
  await mkdir(path.dirname(envFile), { recursive: true })
  await writeFile(
    envFile,
    [
      `ZILOBASE_IMAGE=${previousImage}`,
      "ZILOBASE_PULL_POLICY=never",
      "ZILOBASE_SITE_ADDRESS=http://127.0.0.1",
      "ZILOBASE_STORAGE_SITE_ADDRESS=http://127.0.0.1",
      `ZILOBASE_DEV_HTTP_PORT=${httpPort}`,
      `MINIO_DEV_API_PORT=${minioPort}`,
      `MAILPIT_DEV_UI_PORT=${mailpitPort}`,
      `CLIENT_URL=${origin}`,
      `BETTER_AUTH_URL=${origin}`,
      `S3_PUBLIC_ENDPOINT=http://127.0.0.1:${minioPort}`,
      `BETTER_AUTH_SECRET=${secret(48)}`,
      `ZILOBASE_BOOTSTRAP_TOKEN=${secret(48)}`,
      "POSTGRES_DB=zilobase",
      "POSTGRES_USER=zilobase",
      `POSTGRES_PASSWORD=${secret(32)}`,
      "MINIO_BUCKET=zilobase",
      "MINIO_ROOT_USER=zilobase",
      `MINIO_ROOT_PASSWORD=${secret(32)}`,
      "EMAIL_FROM=Zilobase <hello@zilobase.local>",
      "SMTP_HOST=mailpit",
      "SMTP_PORT=1025",
      "SMTP_SECURE=false",
      "SMTP_USER=",
      "SMTP_PASSWORD=",
      "GOOGLE_CLIENT_ID=",
      "GOOGLE_CLIENT_SECRET=",
      "",
    ].join("\n"),
    { mode: 0o600 },
  )
}

async function requestJson(route, { body, jar: requestJar, method }) {
  const headers = new Headers({ origin })
  if (body !== undefined) headers.set("content-type", "application/json")
  if (requestJar?.header()) headers.set("cookie", requestJar.header())
  const response = await fetch(`${origin}${route}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers,
    method,
  })
  requestJar?.store(response.headers)
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok)
    throw new Error(
      `${method} ${route} failed with ${response.status}: ${text}`,
    )
  return { data, response }
}

async function waitForMessage(recipient) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const response = await fetch(
      `http://127.0.0.1:${mailpitPort}/api/v1/messages`,
    )
    if (response.ok) {
      const mailbox = await response.json()
      const match = mailbox.messages?.find((message) =>
        JSON.stringify(message).toLowerCase().includes(recipient.toLowerCase()),
      )
      const id = match?.ID ?? match?.Id ?? match?.id
      if (id) {
        const detail = await fetch(
          `http://127.0.0.1:${mailpitPort}/api/v1/message/${encodeURIComponent(id)}`,
        )
        if (detail.ok) return JSON.stringify(await detail.json())
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Mailpit did not receive a message for ${recipient}`)
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
    "-f",
    "docker-compose.upgrade.yml",
    "--profile",
    "dev",
    ...args,
  ]
}

function compose(image, args) {
  return run("docker", composeArguments(args), {
    env: {
      ...process.env,
      ZILOBASE_IMAGE: image,
      ZILOBASE_PULL_POLICY: "never",
    },
  })
}

function captureCompose(image, args) {
  return capture("docker", composeArguments(args), {
    env: {
      ...process.env,
      ZILOBASE_IMAGE: image,
      ZILOBASE_PULL_POLICY: "never",
    },
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
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    child.once("error", reject)
    child.once("exit", (code) => resolve({ code, stderr, stdout }))
  })
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      const port = typeof address === "object" && address ? address.port : null
      server.close((error) =>
        error || port === null ? reject(error) : resolve(port),
      )
    })
  })
}

function required(name) {
  const value = process.env[name]
  assert.ok(value, `${name} is required`)
  return value
}

function splitSetCookie(value) {
  return value ? value.split(/,(?=\s*[^;,]+=)/g).map((item) => item.trim()) : []
}

function sanitize(value) {
  return value
    .replaceAll(password, "[REDACTED]")
    .replace(/([?&](?:X-Amz-[^=]+|x-id)=[^&\s]+)/gi, "[SIGNED_QUERY_REDACTED]")
}

function secret(bytes) {
  return randomBytes(bytes).toString("base64url")
}
