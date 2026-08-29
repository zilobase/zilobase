import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { access, mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { build } from "esbuild"

const supportDir = dirname(fileURLToPath(import.meta.url))
const testDir = join(supportDir, "..")
const appDir = join(testDir, "..")
const workspaceDir = join(appDir, "..", "..")
const srcDir = join(appDir, "src")
const tempDir = await mkdtemp(join(tmpdir(), "zilobase-web-tests-"))
const loadedModules = new Map()

const tests = []
const context = {
  assert,
  appPath,
  loadModule,
  readSource,
  readWorkspace,
  sourcePath,
  test: (name, run) => {
    tests.push({ name, run })
  },
}

try {
  const testFiles = await findTestFiles(testDir)

  for (const file of testFiles) {
    const module = await import(pathToFileURL(file).href)
    module.register(context)
  }

  for (const { name, run } of tests) {
    await run()
    console.log(`ok ${name}`)
  }
} finally {
  await rm(tempDir, { force: true, recursive: true })
}

async function loadModule(path) {
  const sourcePath = path.startsWith("/src/")
    ? join(appDir, path.slice(1))
    : path.startsWith("/")
      ? join(workspaceDir, path.slice(1))
    : path
  const cacheKey = sourcePath

  if (loadedModules.has(cacheKey)) {
    return loadedModules.get(cacheKey)
  }

  const hash = createHash("sha1").update(sourcePath).digest("hex").slice(0, 8)
  const outfile = join(tempDir, `${basename(sourcePath)}-${hash}.mjs`)

  await build({
    bundle: true,
    define: {
      "import.meta.env": JSON.stringify({
        DEV: false,
        VITE_API_URL: "https://api.zilobase.test",
      }),
    },
    entryPoints: [sourcePath],
    external: ["@zilobase/features"],
    format: "esm",
    jsx: "automatic",
    logLevel: "silent",
    outfile,
    platform: "node",
    plugins: [aliasPlugin()],
  })

  const module = await import(pathToFileURL(outfile).href)
  loadedModules.set(cacheKey, module)

  return module
}

function sourcePath(path) {
  const relativePath = path.startsWith("/src/")
    ? path.slice(1)
    : path.replace(/^src\//, "src/")
  return join(appDir, relativePath)
}

function appPath(path) {
  return join(appDir, path.replace(/^\//, ""))
}

function readSource(path) {
  return readFile(sourcePath(path), "utf8")
}

function readWorkspace(path) {
  return readFile(join(workspaceDir, path.replace(/^\//, "")), "utf8")
}

async function findTestFiles(directory) {
  const files = []

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "support") continue
    const entryPath = join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...await findTestFiles(entryPath))
    } else if (entry.name.endsWith(".test.mjs")) {
      files.push(entryPath)
    }
  }

  return files.sort()
}

function aliasPlugin() {
  return {
    name: "zilobase-test-alias",
    setup(build) {
      build.onResolve({ filter: /^@zilobase\/edition-web$/ }, () => ({
        path: join(srcDir, "edition", "community.tsx"),
      }))
      build.onResolve({ filter: /^@\/packages\/editor\/?/ }, async (args) => ({
        path: await resolveAliasPath(
          join(srcDir, "editor", args.path.replace(/^@\/packages\/editor\/?/, ""))
        ),
      }))
      build.onResolve(
        { filter: /^@zilobase\/features\/databases\/property-types$/ },
        () => ({
          path: join(
            appDir,
            "..",
            "..",
            "packages",
            "features",
            "src",
            "databases",
            "property-types.ts"
          ),
        })
      )
      build.onResolve({ filter: /^@\// }, async (args) => ({
        path: await resolveAliasPath(join(srcDir, args.path.slice(2))),
      }))
    },
  }
}

async function resolveAliasPath(path) {
  for (const candidate of [path, `${path}.ts`, `${path}.tsx`]) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Try the next candidate.
    }
  }

  return path
}
