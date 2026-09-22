import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { apiUrl, localProfiles } from "../dev/config.mjs"
import {
  describeDevelopmentProvider,
  discoverDevelopmentProviders,
} from "../dev/providers.mjs"

const coreDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const children = []
let stopping = false

export function desktopDevelopmentPlan({ communityApi, providers }) {
  const cloudProvider = providers.find((provider) => provider.id === "cloudflare")
  const cloudRuntime = cloudProvider?.runtimes?.find((runtime) => runtime.id === "cloudflare")
    ?? cloudProvider?.runtimes?.[0]
  const customServers = []
  const community = loopbackOrigin(communityApi)
  if (community) customServers.push({ label: "Self-hosted Community", url: community })
  for (const provider of providers) {
    if (provider.id === "cloudflare") continue
    for (const runtime of provider.runtimes ?? []) {
      const url = loopbackOrigin(runtime?.api)
      const label = cleanLabel(runtime?.name)
      if (!url || !label || customServers.some((server) => server.url === url)) continue
      customServers.push({ label, url })
    }
  }
  return {
    cloudApiOrigin: loopbackOrigin(cloudRuntime?.api) ?? "http://localhost:3010",
    cloudWebOrigin: loopbackOrigin(cloudRuntime?.app) ?? "http://localhost:1422",
    customServers,
  }
}

function cleanLabel(value) {
  if (typeof value !== "string") return ""
  const label = value.trim().replace(/\s+/g, " ")
  return label.length > 0 && label.length <= 80 ? label : ""
}

function loopbackOrigin(value) {
  if (typeof value !== "string") return null
  try {
    const trimmed = value.trim()
    const url = new URL(trimmed)
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "")
    if (
      url.origin !== trimmed.replace(/\/$/, "") ||
      url.username ||
      url.password ||
      url.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "::1"].includes(hostname)
    ) return null
    return url.origin
  } catch {
    return null
  }
}

function shutdown(code = 0) {
  if (stopping) return
  stopping = true
  process.exitCode = code
  for (const child of children) {
    if (child.exitCode === null) child.kill("SIGINT")
  }
  const killTimer = setTimeout(() => {
    for (const child of children) {
      if (child.exitCode === null) child.kill("SIGKILL")
    }
    process.exit(code)
  }, 20_000)
  killTimer.unref()
  void Promise.all(children.map((child) => child.exitCode === null
    ? new Promise((resolve) => child.once("exit", resolve))
    : Promise.resolve())).then(() => {
    clearTimeout(killTimer)
    process.exit(code)
  })
}

async function waitForUrl(url, child) {
  const deadline = Date.now() + 15 * 60 * 1000
  let lastError = "not reachable"
  while (!stopping && Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Development workspace exited before ${url} was ready.`)
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) })
      if (response.ok) return
      lastError = `HTTP ${response.status}`
    } catch (error) {
      if (stopping) return
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  if (!stopping) throw new Error(`Timed out waiting for ${url}: ${lastError}`)
}

async function providerRuntimes(provider) {
  if (provider.id === "cloudflare") return provider.model?.runtimes ?? []
  try {
    const model = await describeDevelopmentProvider(provider)
    return model.runtimes ?? []
  } catch (error) {
    console.warn(`Unable to describe development provider ${provider.id}: ${error instanceof Error ? error.message : String(error)}`)
    return provider.model?.runtimes ?? []
  }
}

async function main() {
  const providers = await discoverDevelopmentProviders()
  if (!providers.some((provider) => provider.id === "cloudflare")) {
    throw new Error("npm run dev:desktop needs the local Cloudflare development provider so Zilobase Cloud can use that runtime.")
  }

  const community = localProfiles.node
  const readiness = [
    `http://127.0.0.1:${community.apiPort}/ready`,
    `http://127.0.0.1:${community.appPort}`,
    ...providers.flatMap((provider) => provider.readiness),
  ]
  const workspace = spawn(process.execPath, [path.join(coreDir, "scripts/dev/workspace.mjs")], {
    cwd: coreDir,
    env: { ...process.env, ZILOBASE_DEV_WORKSPACE_CHILD: "1" },
    stdio: "inherit",
  })
  children.push(workspace)
  workspace.once("error", (error) => {
    console.error(error)
    shutdown(1)
  })
  workspace.once("exit", (code, signal) => {
    if (!stopping) shutdown(code ?? (signal ? 1 : 0))
  })

  process.on("SIGINT", () => shutdown(0))
  process.on("SIGTERM", () => shutdown(0))

  await Promise.all(readiness.map((url) => waitForUrl(url, workspace)))
  if (stopping) return

  const described = []
  for (const provider of providers) {
    described.push({ id: provider.id, runtimes: await providerRuntimes(provider) })
    if (stopping) return
  }
  const plan = desktopDevelopmentPlan({
    communityApi: apiUrl(community),
    providers: described,
  })
  console.info(`Opening Electron. Zilobase Cloud is ${plan.cloudApiOrigin}.`)
  for (const server of plan.customServers) {
    console.info(`Custom server: ${server.label} ${server.url}`)
  }

  const electron = spawn(process.platform === "win32" ? "npm.cmd" : "npm", [
    "run", "dev:electron", "--workspace", "@zilobase/desktop",
  ], {
    cwd: coreDir,
    env: {
      ...process.env,
      VITE_API_URL: plan.cloudApiOrigin,
      ZILOBASE_DESKTOP_DEV_ORIGIN: plan.cloudWebOrigin,
      ZILOBASE_DESKTOP_DEV_SERVERS: JSON.stringify(plan.customServers),
    },
    stdio: "inherit",
  })
  children.push(electron)
  electron.once("error", (error) => {
    console.error(error)
    shutdown(1)
  })
  electron.once("exit", (code, signal) => {
    if (!stopping) shutdown(code ?? (signal ? 1 : 0))
  })
}

function isMain() {
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
}

if (isMain()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    shutdown(1)
  })
}
