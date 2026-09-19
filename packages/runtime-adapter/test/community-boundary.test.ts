import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = new URL("..", import.meta.url);
const srcRoot = new URL("../src/", import.meta.url);

const HOSTED_TOKENS = [
  "hosted-demo",
  "hosted-extension",
  "hosted-edition",
  "identity/hosted",
  "zilobase_identity_config_keys",
  "api.zilobase.com",
  "demo.zilobase.com",
  "app.zilobase.com",
  ".zilobase.com",
];

const WORKER_HOSTED_TOKENS = [
  ...HOSTED_TOKENS,
  "posthog-project-token",
  "posthog_node",
  "posthog-node",
  "us.i.posthog.com",
  "us-assets.i.posthog.com",
  "posthog-logs",
];

const NODE_BANNED = [
  ...HOSTED_TOKENS,
  "posthog",
  "cloudflare",
  "chat_agent",
  "chatagent",
  "from \"agents\"",
  "from 'agents'",
  "agents/",
  "@cloudflare/",
  "zilobase_demo_enabled",
];

const WORKER_BANNED = [
  ...WORKER_HOSTED_TOKENS,
  "zilobase_demo_enabled",
  "zilobase-images",
  "fb44",
  "ap-south",
  "ioredis",
  "aws-sdk",
  "drizzle-orm",
  "from \"ws\"",
  "from 'ws'",
  "from \"pg\"",
  "from 'pg'",
  "node:",
];

const ROOT_BANNED = [
  "ioredis",
  "\"ws\"",
  "'ws'",
  "aws-sdk",
  "@hocuspocus",
  "\"agents\"",
  "'agents'",
  "@cloudflare/",
  "drizzle-orm",
  "crossws",
  "cloudflare:",
  "@zilobase/server",
];

const HEAVY_DEPENDENCIES = [
  "ioredis",
  "ws",
  "pg",
  "aws-sdk",
  "@aws-sdk/client-s3",
  "agents",
  "@cloudflare/ai-chat",
  "@cloudflare/workers-types",
  "drizzle-orm",
  "crossws",
  "@hocuspocus/server",
  "@hocuspocus/extension-redis",
];

// Third-party specifiers that legitimately end in /node on the worker side.
const WORKER_NODE_ALLOWLIST = ["crossws/adapters/node"];

async function sourceFiles(dir: URL): Promise<URL[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: URL[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      files.push(...await sourceFiles(new URL(`${entry.name}/`, dir)));
    } else if (/\.(ts|js|mjs)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
      files.push(new URL(entry.name, dir));
    }
  }
  return files;
}

async function allSourceFiles(dir: URL): Promise<URL[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: URL[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      files.push(...await allSourceFiles(new URL(`${entry.name}/`, dir)));
    } else if (/\.(ts|js|mjs)$/.test(entry.name)) {
      files.push(new URL(entry.name, dir));
    }
  }
  return files;
}

function relativeTo(file: URL) {
  return path.relative(new URL(packageRoot).pathname, new URL(file).pathname);
}

function importSpecifiers(content: string): string[] {
  return [...content.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
}

function stripComments(content: string) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

async function expectNoTokens(files: URL[], tokens: string[], scope: string) {
  for (const file of files) {
    const content = stripComments(await readFile(file, "utf8")).toLowerCase();
    for (const token of tokens) {
      expect(
        content.includes(token),
        `${scope}: ${relativeTo(file)} contains banned token ${JSON.stringify(token)}`,
      ).toBe(false);
    }
  }
}

describe("community boundary", () => {
  it("node runtime never imports worker or Cloudflare/hosted code", async () => {
    const files = await sourceFiles(new URL("../src/node/", import.meta.url));
    expect(files.length).toBeGreaterThan(0);
    await expectNoTokens(files, NODE_BANNED, "node");
    for (const file of files) {
      for (const spec of importSpecifiers(await readFile(file, "utf8"))) {
        expect(
          spec.includes("worker/") || spec === "../worker" || spec === "./worker",
          `node: ${relativeTo(file)} imports worker side via ${spec}`,
        ).toBe(false);
      }
    }
  });

  it("worker runtime never imports node-only or hosted-only code", async () => {
    const files = await sourceFiles(new URL("../src/worker/", import.meta.url));
    expect(files.length).toBeGreaterThan(0);
    await expectNoTokens(files, WORKER_BANNED, "worker");
    for (const file of files) {
      for (const spec of importSpecifiers(await readFile(file, "utf8"))) {
        if (WORKER_NODE_ALLOWLIST.includes(spec)) continue;
        const hitsNode = spec.includes("/node/") || spec === "../node" ||
          spec === "./node" || spec === "@zilobase/runtime-adapter/node" ||
          (/(^|\/)node$/.test(spec) && spec !== "crossws/adapters/node");
        expect(hitsNode, `worker: ${relativeTo(file)} imports node side via ${spec}`).toBe(false);
      }
    }
  });

  it("package root imports nothing heavy and never touches server code", async () => {
    const entries = await readdir(srcRoot);
    const roots = entries
      .filter((name) => /\.(ts|js)$/.test(name) && !name.endsWith(".test.ts"))
      .map((name) => new URL(name, srcRoot));
    expect(roots.length).toBeGreaterThan(0);
    await expectNoTokens(roots, ROOT_BANNED, "root");
    for (const file of roots) {
      for (const spec of importSpecifiers(await readFile(file, "utf8"))) {
        expect(
          spec === "./node" || spec === "./worker" || spec.startsWith("./node/") || spec.startsWith("./worker/"),
          `root: ${relativeTo(file)} statically imports a runtime side via ${spec}`,
        ).toBe(false);
      }
    }
  });

  it("no test file bridges the runtime sides either", async () => {
    for (const file of await allSourceFiles(new URL("../src/node/", import.meta.url))) {
      for (const spec of importSpecifiers(await readFile(file, "utf8"))) {
        expect(
          spec.includes("worker/"),
          `node: ${relativeTo(file)} references the worker side via ${spec}`,
        ).toBe(false);
      }
    }
    for (const file of await allSourceFiles(new URL("../src/worker/", import.meta.url))) {
      for (const spec of importSpecifiers(await readFile(file, "utf8"))) {
        if (WORKER_NODE_ALLOWLIST.includes(spec)) continue;
        const hitsNode = spec.includes("/node/") || spec === "../node" || spec === "./node";
        expect(hitsNode, `worker: ${relativeTo(file)} references the node side via ${spec}`).toBe(false);
      }
    }
  });

  it("heavy dependencies stay peer/optional, never hard", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    );
    for (const name of HEAVY_DEPENDENCIES) {
      expect(
        manifest.dependencies?.[name],
        `dependencies must not include heavy package ${name}`,
      ).toBeUndefined();
    }
    expect(manifest.dependencies?.hono).toBeTruthy();
  });
});
