import { readFile, stat } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const distDir = join(repoRoot, "apps/web/dist")
const manifest = JSON.parse(
  await readFile(join(distDir, ".vite/manifest.json"), "utf8"),
)

const entryKey = Object.keys(manifest).find((key) => manifest[key].isEntry)
if (!entryKey) throw new Error("Web build manifest has no entry module")

const entry = manifest[entryKey]
const initialBytes = await fileSize(entry.file)
const maxInitialBytes = 1_500_000
const maxRouteBytes = 1_000_000
const failures = []

if (initialBytes > maxInitialBytes) {
  failures.push(
    `initial JavaScript is ${formatBytes(initialBytes)} (budget ${formatBytes(maxInitialBytes)})`,
  )
}

const routeEntries = (entry.dynamicImports ?? [])
  .map((key) => ({ key, value: manifest[key] }))
  .filter(({ key, value }) =>
    value &&
    !key.includes("node_modules/") &&
    !key.startsWith("src/app/"),
  )

for (const { key, value } of routeEntries) {
  const bytes = await fileSize(value.file)
  if (bytes > maxRouteBytes) {
    failures.push(
      `${value.name ?? key} route chunk is ${formatBytes(bytes)} (budget ${formatBytes(maxRouteBytes)})`,
    )
  }
}

const shikiAllowedRoutes = new Set([
  "ai",
  "database",
  "meeting",
  "page",
  "recents",
  "trash",
])

for (const { key, value } of routeEntries) {
  const routeName = value.name ?? key
  if (shikiAllowedRoutes.has(routeName)) continue

  const eagerShikiModules = [...collectStaticImports(key)].filter(isShikiModule)
  if (eagerShikiModules.length > 0) {
    failures.push(
      `${routeName} eagerly includes Shiki through ${eagerShikiModules[0]}`,
    )
  }
}

const lockfile = JSON.parse(
  await readFile(join(repoRoot, "package-lock.json"), "utf8"),
)
const shikiInstallations = Object.keys(lockfile.packages).filter((path) =>
  /(?:^|\/)node_modules\/shiki$/.test(path),
)
if (shikiInstallations.length !== 1) {
  failures.push(
    `expected one Shiki installation in package-lock.json, found ${shikiInstallations.length}`,
  )
}

if (failures.length > 0) {
  throw new Error(`Web bundle budget failed:\n- ${failures.join("\n- ")}`)
}

console.log(
  `Web bundle budget passed: initial ${formatBytes(initialBytes)}, ` +
    `${routeEntries.length} route chunks below ${formatBytes(maxRouteBytes)}, ` +
    "one Shiki installation.",
)

function collectStaticImports(key, seen = new Set()) {
  if (seen.has(key) || !manifest[key]) return seen
  seen.add(key)
  for (const importedKey of manifest[key].imports ?? []) {
    collectStaticImports(importedKey, seen)
  }
  return seen
}

function isShikiModule(key) {
  return /node_modules\/(?:@shikijs\/|shiki\/)/.test(key)
}

async function fileSize(path) {
  return (await stat(join(distDir, path))).size
}

function formatBytes(bytes) {
  return `${(bytes / 1_000_000).toFixed(2)} MB`
}
