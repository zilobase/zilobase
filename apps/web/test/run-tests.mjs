import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { build } from "esbuild"

const testDir = dirname(fileURLToPath(import.meta.url))
const appDir = join(testDir, "..")
const tempDir = await mkdtemp(join(tmpdir(), "notelab-web-tests-"))
const loadedModules = new Map()

const tests = []
const context = {
  assert,
  loadModule,
  test: (name, run) => {
    tests.push({ name, run })
  },
}

try {
  const testFiles = (await readdir(testDir))
    .filter((file) => file.endsWith(".test.mjs"))
    .sort()

  for (const file of testFiles) {
    const module = await import(pathToFileURL(join(testDir, file)).href)
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
    : path
  const cacheKey = sourcePath

  if (loadedModules.has(cacheKey)) {
    return loadedModules.get(cacheKey)
  }

  const hash = createHash("sha1").update(sourcePath).digest("hex").slice(0, 8)
  const outfile = join(tempDir, `${basename(sourcePath)}-${hash}.mjs`)

  await build({
    bundle: true,
    entryPoints: [sourcePath],
    external: ["@notelab/features", "@notelab/features/*"],
    format: "esm",
    jsx: "automatic",
    logLevel: "silent",
    outfile,
    platform: "node",
  })

  const module = await import(pathToFileURL(outfile).href)
  loadedModules.set(cacheKey, module)

  return module
}
