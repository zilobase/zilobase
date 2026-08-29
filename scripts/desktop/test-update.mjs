import assert from "node:assert/strict"
import {
  createReadStream,
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { createServer } from "node:http"
import { homedir } from "node:os"
import { basename, dirname, join, relative } from "node:path"
import { execFileSync, spawn } from "node:child_process"
import { once } from "node:events"
import { fileURLToPath } from "node:url"

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const desktopDir = join(rootDir, "apps", "desktop")
const tauriDir = join(desktopDir, "src-tauri")
const outputDir = join(tauriDir, "target", "local-update-test")
const bundleDir = join(tauriDir, "target", "release", "bundle", "macos")
const appName = "zilobase-update-test"
const port = Number(process.env.ZILOBASE_UPDATE_TEST_PORT || 8123)

if (process.argv.includes("--help")) {
  console.log(
    "Usage: npm run test:update-local\n\nBuilds and launches a local signed macOS update test on port 8123.",
  )
  process.exit(0)
}

if (process.argv.includes("--self-check")) {
  assert.equal(nextPatchVersion("0.0.9"), "0.0.10")
  assert.equal(updaterTarget("arm64"), "darwin-aarch64")
  assert.equal(updaterTarget("x64"), "darwin-x86_64")
  console.log("Local desktop updater self-check passed.")
  process.exit(0)
}

await main()

async function main() {
  if (process.platform !== "darwin") {
    throw new Error("The local desktop update test currently supports macOS only.")
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid ZILOBASE_UPDATE_TEST_PORT: ${port}`)
  }

  const baseConfig = JSON.parse(
    readFileSync(join(tauriDir, "tauri.conf.json"), "utf8"),
  )
  const baselineVersion = baseConfig.version
  const updateVersion = nextPatchVersion(baselineVersion)
  const updaterKeyPath = join(homedir(), ".tauri", "zilobase.key")
  const updaterKey =
    process.env.TAURI_SIGNING_PRIVATE_KEY ||
    readFileSync(updaterKeyPath, "utf8").trim()

  assertSafeOutputPath(outputDir)
  rmSync(outputDir, { force: true, recursive: true })
  mkdirSync(outputDir, { recursive: true })

  const baselineConfigPath = writeTestConfig("baseline", baselineVersion)
  const updateConfigPath = writeTestConfig("update", updateVersion)
  const buildEnv = {
    ...process.env,
    TAURI_SIGNING_PRIVATE_KEY: updaterKey,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD:
      process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD || "",
  }

  console.log(`Building local baseline ${baselineVersion}…`)
  build(baselineConfigPath, buildEnv)

  const builtAppPath = join(bundleDir, `${appName}.app`)
  const baselineAppPath = join(outputDir, `${appName}.app`)
  cpSync(builtAppPath, baselineAppPath, { recursive: true })

  console.log(`Building signed update ${updateVersion}…`)
  build(updateConfigPath, buildEnv)

  const archiveName = `${appName}.app.tar.gz`
  const archivePath = join(bundleDir, archiveName)
  const signaturePath = `${archivePath}.sig`
  const servedArchivePath = join(outputDir, archiveName)
  const servedSignaturePath = `${servedArchivePath}.sig`
  cpSync(archivePath, servedArchivePath)
  cpSync(signaturePath, servedSignaturePath)

  const latestJsonPath = join(outputDir, "latest.json")
  writeFileSync(
    latestJsonPath,
    `${JSON.stringify(
      {
        version: updateVersion,
        notes: "Local Zilobase desktop updater test.",
        pub_date: new Date().toISOString(),
        platforms: {
          [updaterTarget(process.arch)]: {
            signature: readFileSync(servedSignaturePath, "utf8").trim(),
            url: `http://127.0.0.1:${port}/${archiveName}`,
          },
        },
      },
      null,
      2,
    )}\n`,
  )

  const server = createUpdateServer([
    latestJsonPath,
    servedArchivePath,
    servedSignaturePath,
  ])
  server.listen(port, "127.0.0.1")
  await once(server, "listening")

  console.log(
    `Serving signed update ${updateVersion} at http://127.0.0.1:${port}/latest.json`,
  )
  console.log(`Opening baseline ${baselineVersion}. Click “Update and restart” in the app.`)
  console.log("Press Control-C after testing; artifacts remain in:")
  console.log(outputDir)

  spawn("open", ["-n", baselineAppPath], { detached: true, stdio: "ignore" }).unref()

  const stop = () => server.close(() => process.exit(0))
  process.once("SIGINT", stop)
  process.once("SIGTERM", stop)
}

function build(configPath, env) {
  execFileSync(
    "npm",
    ["run", "build", "--", "--bundles", "app", "--config", configPath],
    { cwd: desktopDir, env, stdio: "inherit" },
  )
}

function writeTestConfig(label, version) {
  const path = join(outputDir, `${label}.tauri.conf.json`)
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        productName: appName,
        version,
        identifier: "com.zilobase.update-test",
        bundle: {
          createUpdaterArtifacts: true,
          macOS: { signingIdentity: "-" },
        },
        plugins: {
          updater: {
            endpoints: [`http://127.0.0.1:${port}/latest.json`],
            dangerousInsecureTransportProtocol: true,
          },
        },
      },
      null,
      2,
    )}\n`,
  )
  return path
}

function createUpdateServer(paths) {
  const files = new Map(paths.map((path) => [`/${basename(path)}`, path]))

  return createServer((request, response) => {
    const path = files.get(
      new URL(request.url || "/", `http://127.0.0.1:${port}`).pathname,
    )
    if (!path) {
      response.writeHead(404).end("Not found")
      return
    }

    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": statSync(path).size,
      "Content-Type": path.endsWith(".json")
        ? "application/json"
        : "application/octet-stream",
    })
    createReadStream(path).pipe(response)
  })
}

function nextPatchVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) throw new Error(`Expected a stable semantic version, received: ${version}`)
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`
}

function updaterTarget(arch) {
  if (arch === "arm64") return "darwin-aarch64"
  if (arch === "x64") return "darwin-x86_64"
  throw new Error(`Unsupported macOS architecture: ${arch}`)
}

function assertSafeOutputPath(path) {
  const targetDir = join(tauriDir, "target")
  const pathFromTarget = relative(targetDir, path)
  if (!pathFromTarget || pathFromTarget.startsWith("..")) {
    throw new Error(`Refusing to clear unsafe output path: ${path}`)
  }
}
