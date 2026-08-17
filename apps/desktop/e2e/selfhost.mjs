#!/usr/bin/env node

import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { access, mkdir } from "node:fs/promises"
import net from "node:net"
import path from "node:path"
import process from "node:process"
import { remote } from "webdriverio"

const application = requiredPath("ZILOBASE_DESKTOP_BINARY")
const packageArtifact = requiredPath("ZILOBASE_DESKTOP_PACKAGE")
const serverOrigin = requiredOrigin("ZILOBASE_E2E_SERVER")
const diagnosticsDirectory = path.resolve(
  process.env.ZILOBASE_DESKTOP_DIAGNOSTICS_DIR || "artifacts/desktop-selfhost",
)
const driverPort = Number(process.env.ZILOBASE_TAURI_DRIVER_PORT || 4444)
let browser
let driver

await Promise.all([access(application), access(packageArtifact)])
await mkdir(diagnosticsDirectory, { recursive: true })

try {
  driver = spawn("tauri-driver", ["--port", String(driverPort)], {
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"],
  })
  await waitForPort(driverPort, driver)

  browser = await remote({
    capabilities: {
      "tauri:options": { application },
    },
    hostname: "127.0.0.1",
    logLevel: "warn",
    port: driverPort,
  })

  const continueScreen = await browser.$(
    "//h1[normalize-space()='Continue in your browser']",
  )
  await continueScreen.waitForDisplayed({ timeout: 30_000 })

  await selectServer(serverOrigin)

  const additionalServer = process.env.ZILOBASE_E2E_ADDITIONAL_SERVER?.trim()
  if (additionalServer) {
    await selectServer(requiredOrigin("ZILOBASE_E2E_ADDITIONAL_SERVER"))
  }

  console.info(`Packaged desktop connected to ${new URL(serverOrigin).origin}.`)
} catch (error) {
  if (browser) {
    await browser
      .saveScreenshot(path.join(diagnosticsDirectory, "desktop-failure.png"))
      .catch(() => undefined)
  }
  throw error
} finally {
  if (browser) await browser.deleteSession().catch(() => undefined)
  if (driver && !driver.killed) driver.kill("SIGTERM")
}

async function selectServer(origin) {
  const serverInput = await browser.$("#desktop-server-url")
  if (!(await serverInput.isDisplayed().catch(() => false))) {
    const changeServer = await browser.$(
      "//a[normalize-space()='Change server']",
    )
    await changeServer.waitForDisplayed({ timeout: 30_000 })
    await changeServer.click()
    await serverInput.waitForDisplayed({ timeout: 10_000 })
  }
  await serverInput.setValue(origin)
  await (
    await browser.$("//button[normalize-space()='Verify and continue']")
  ).click()

  const confirmChange = await browser.$(
    "//button[normalize-space()='Change server']",
  )
  await confirmChange.waitForDisplayed({ timeout: 30_000 })
  await confirmChange.click()

  const selectedOrigin = await browser.$(
    `//*[normalize-space()=${xpathString(origin)}]`,
  )
  await selectedOrigin.waitForDisplayed({ timeout: 30_000 })
  await (
    await browser.$("//button[normalize-space()='Continue in Browser']")
  ).waitForDisplayed({ timeout: 10_000 })
}

function requiredPath(name) {
  const value = process.env[name]
  assert.ok(value, `${name} is required`)
  return path.resolve(value)
}

function requiredOrigin(name) {
  const value = process.env[name]
  assert.ok(value, `${name} is required`)
  const url = new URL(value)
  assert.equal(url.toString(), `${url.origin}/`)
  return url.origin
}

function waitForPort(port, child) {
  const deadline = Date.now() + 15_000
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      if (child.exitCode !== null) {
        reject(new Error(`tauri-driver exited with ${child.exitCode}`))
        return
      }
      const socket = net.createConnection({ host: "127.0.0.1", port })
      socket.once("connect", () => {
        socket.destroy()
        resolve()
      })
      socket.once("error", () => {
        socket.destroy()
        if (Date.now() >= deadline)
          reject(new Error("tauri-driver did not start"))
        else setTimeout(tryConnect, 100)
      })
    }
    tryConnect()
  })
}

function xpathString(value) {
  if (!value.includes("'")) return `'${value}'`
  if (!value.includes('"')) return `"${value}"`
  return `concat(${value
    .split("'")
    .map((part) => `'${part}'`)
    .join(', "\'", ')})`
}
