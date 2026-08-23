#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process"
import { basename, dirname, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const DEBUG_BINARY_NAME = "zilobase-client"
const DEBUG_IDENTIFIER = "com.zilobase.debug"
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const targetRoot = resolve(repositoryRoot, "apps/desktop/src-tauri/target")

const arguments_ = process.argv.slice(2)
const signOnly = arguments_[0] === "--sign-only"
if (signOnly) arguments_.shift()

const [executable, ...applicationArguments] = arguments_
if (!executable) {
  fail("The macOS debug runner expected an executable path.")
}

const resolvedExecutable = resolve(executable)
const targetRelativePath = relative(targetRoot, resolvedExecutable)
const isZilobaseDebugBinary =
  basename(resolvedExecutable) === DEBUG_BINARY_NAME &&
  targetRelativePath !== "" &&
  targetRelativePath !== ".." &&
  !targetRelativePath.startsWith(`..${sep}`) &&
  !targetRelativePath.includes(`${sep}release${sep}`)

if (
  process.platform === "darwin" &&
  isZilobaseDebugBinary &&
  process.env.ZILOBASE_SKIP_DEBUG_SIGNING !== "1"
) {
  signDebugExecutable(resolvedExecutable)
}

if (signOnly) process.exit(0)

const child = spawn(resolvedExecutable, applicationArguments, {
  stdio: "inherit",
})

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal)
  })
}

child.on("error", (error) => fail(`Could not launch the debug app: ${error.message}`))
child.on("exit", (code) => process.exit(code ?? 0))

function signDebugExecutable(path) {
  const identity = findAppleDevelopmentIdentity()
  const result = spawnSync(
    "/usr/bin/codesign",
    [
      "--force",
      "--sign",
      identity,
      "--identifier",
      DEBUG_IDENTIFIER,
      "--timestamp=none",
      path,
    ],
    { stdio: "inherit" },
  )

  if (result.error) {
    fail(`Could not run codesign: ${result.error.message}`)
  }
  if (result.status !== 0) {
    fail(
      "Could not sign the debug app. Allow codesign to use the Apple Development key, or set ZILOBASE_APPLE_DEVELOPMENT_IDENTITY to its SHA-1 identity.",
    )
  }

  const verification = spawnSync(
    "/usr/bin/codesign",
    ["--verify", "--strict", path],
    { stdio: "inherit" },
  )
  if (verification.status !== 0) {
    fail("The signed debug app failed codesign verification.")
  }

  console.log(`Signed ${DEBUG_BINARY_NAME} for local Keychain access.`)
}

function findAppleDevelopmentIdentity() {
  const configured = process.env.ZILOBASE_APPLE_DEVELOPMENT_IDENTITY?.trim()
  if (configured) return configured

  const result = spawnSync(
    "/usr/bin/security",
    ["find-identity", "-v", "-p", "codesigning"],
    { encoding: "utf8" },
  )
  if (result.error || result.status !== 0) {
    fail("Could not inspect the macOS code-signing identities.")
  }

  const match = result.stdout.match(
    /^\s*\d+\)\s+([A-F0-9]{40})\s+"Apple Development:[^"]+"/m,
  )
  if (!match) {
    fail(
      "No valid Apple Development signing identity was found. Add your developer account in Xcode, or set ZILOBASE_SKIP_DEBUG_SIGNING=1 to run ad-hoc.",
    )
  }
  return match[1]
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
