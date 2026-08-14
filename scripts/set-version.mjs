import { readFileSync, writeFileSync } from "node:fs"

const version = process.argv[2]
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

if (!version || !semver.test(version)) {
  console.error("Usage: npm run version:set -- 0.2.0")
  process.exit(1)
}

const jsonFiles = [
  ["package.json", ["version"]],
  ["apps/web/package.json", ["version"]],
  ["apps/server/package.json", ["version"]],
  ["apps/desktop/package.json", ["version"]],
]

for (const [file, path] of jsonFiles) {
  const json = JSON.parse(readFileSync(file, "utf8"))
  let target = json
  for (const key of path.slice(0, -1)) target = target[key]
  target[path.at(-1)] = version
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`)
}

for (const file of ["apps/desktop/src-tauri/Cargo.toml", "apps/desktop/src-tauri/tauri.conf.json"]) {
  const text = readFileSync(file, "utf8").replace(/version = ".*?"|"version": ".*?"/, (match) =>
    match.startsWith('"') ? `"version": "${version}"` : `version = "${version}"`,
  )
  writeFileSync(file, text)
}

const serverVersionFile = "apps/server/src/version.ts"
const serverVersion = readFileSync(serverVersionFile, "utf8").replace(
  /export const SERVER_VERSION = ".*?";/,
  `export const SERVER_VERSION = "${version}";`,
)
writeFileSync(serverVersionFile, serverVersion)

const cargoLockFile = "apps/desktop/src-tauri/Cargo.lock"
const cargoLock = readFileSync(cargoLockFile, "utf8").replace(
  /(\[\[package\]\]\nname = "zilobase-client"\nversion = ")[^"]+("\n)/,
  `$1${version}$2`,
)
writeFileSync(cargoLockFile, cargoLock)

const lock = JSON.parse(readFileSync("package-lock.json", "utf8"))
lock.version = version
lock.packages[""].version = version
lock.packages["apps/web"].version = version
lock.packages["apps/server"].version = version
lock.packages["apps/desktop"].version = version
writeFileSync("package-lock.json", `${JSON.stringify(lock, null, 2)}\n`)
