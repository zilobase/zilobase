import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const version = process.argv[2]
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

const releaseFiles = [
  "CHANGELOG.md",
  "package.json",
  "package-lock.json",
  "apps/web/package.json",
  "apps/server/package.json",
  "apps/server/src/version.ts",
  "apps/desktop/package.json",
  "apps/desktop/src-tauri/Cargo.toml",
  "apps/desktop/src-tauri/Cargo.lock",
  "apps/desktop/src-tauri/tauri.conf.json",
]

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", stdio: "pipe", ...options })
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!version || !semver.test(version)) {
  fail("Usage: npm run release -- 0.0.2")
}

const tag = `v${version}`

try {
  run("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`])
  fail(`Tag already exists: ${tag}`)
} catch (error) {
  if (error.status !== 1) throw error
}

const dirty = run("git", ["status", "--porcelain"]).trimEnd().split("\n").filter(Boolean)
const unexpectedDirty = dirty.filter((line) => line.slice(3) !== "CHANGELOG.md")

if (unexpectedDirty.length) {
  fail(`Release requires a clean working tree except CHANGELOG.md:\n${unexpectedDirty.join("\n")}`)
}

const changelog = readFileSync("CHANGELOG.md", "utf8")
if (!changelog.includes(`## ${version}`)) {
  fail(`CHANGELOG.md must contain a "## ${version}" section before releasing.`)
}

run("node", ["scripts/set-version.mjs", version], { stdio: "inherit" })
run("git", ["add", ...releaseFiles], { stdio: "inherit" })

const staged = run("git", ["diff", "--cached", "--name-only"]).trim()
if (!staged) {
  fail("No release changes staged.")
}

run("git", ["commit", "-m", `chore: release ${tag}`], { stdio: "inherit" })
run("git", ["tag", "-a", tag, "-m", `Zilobase ${tag}`], { stdio: "inherit" })

console.log(`\nCreated release commit and tag ${tag}.`)
console.log("Publish with:")
console.log("  git push origin main")
console.log(`  git push origin ${tag}`)
