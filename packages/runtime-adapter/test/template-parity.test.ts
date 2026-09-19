import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

// The sibling cloud repo stays the source of truth for the hosted
// composition until cutover; community templates must keep DO bindings,
// migrations, queues, rate limits, and module aliases byte-identical.
const cloudRoot = new URL("../../../../zilobase-cloudflare-adapter/", import.meta.url);
const templateRoot = new URL("../deploy/worker/", import.meta.url);

const HOSTED_MARKERS = [
  "fb44d75753274f128b63d8c3f856e1e4",
  "zilobase-images",
  "ap-south-1",
  "api.zilobase.com",
  "demo.zilobase.com",
  "app.zilobase.com",
  ".zilobase.com",
  "POSTHOG_",
  "posthog-logs",
  "ZILOBASE_IDENTITY_CONFIG_KEYS",
  "ZILOBASE_DEMO_ENABLED\": \"true",
  "889807576206",
  "no-reply@zilobase.com",
];

function stripJsonComments(value: string) {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

async function readJsonc(url: URL) {
  return JSON.parse(stripJsonComments(await readFile(url, "utf8")));
}

describe("template parity with the hosted composition", () => {
  it("keeps worker Durable Object bindings, migrations, queues, and rate limits identical", async () => {
    const [template, prod] = await Promise.all([
      readJsonc(new URL("wrangler.template.jsonc", templateRoot)),
      readJsonc(new URL("wrangler.jsonc", cloudRoot)),
    ]);

    expect(template.migrations.map((entry: { tag: string }) => entry.tag)).toEqual(
      prod.migrations.map((entry: { tag: string }) => entry.tag),
    );
    expect(template.migrations).toEqual(prod.migrations);
    expect(template.durable_objects).toEqual(prod.durable_objects);
    expect(template.queues).toEqual(prod.queues);
    expect(template.ratelimits).toEqual(prod.ratelimits);
    expect(template.alias).toEqual(prod.alias);
    expect(template.compatibility_flags).toEqual(prod.compatibility_flags);
  });

  it("keeps background queues, consumers, bindings, and aliases identical", async () => {
    const [template, prod] = await Promise.all([
      readJsonc(new URL("background.template.jsonc", templateRoot)),
      readJsonc(new URL("background-wrangler.jsonc", cloudRoot)),
    ]);

    expect(template.queues).toEqual(prod.queues);
    expect(template.durable_objects).toEqual(prod.durable_objects);
    expect(template.alias).toEqual(prod.alias);
    expect(template.triggers).toEqual(prod.triggers);
    expect(template.compatibility_flags).toEqual(prod.compatibility_flags);
  });

  it("keeps web assets, services, and observability shape identical", async () => {
    const [template, prod] = await Promise.all([
      readJsonc(new URL("web.template.jsonc", templateRoot)),
      readJsonc(new URL("web-wrangler.jsonc", cloudRoot)),
    ]);

    expect(template.assets).toMatchObject({ binding: "ASSETS" });
    expect(template.services).toEqual(prod.services);
    expect(Object.keys(template.vars ?? {}).sort()).toEqual(
      Object.keys(prod.vars ?? {}).filter((key) => !key.startsWith("POSTHOG_")).sort(),
    );
  });

  it("contains zero hosted credentials, hosts, or placement values", async () => {
    const templates = await Promise.all(
      ["wrangler.template.jsonc", "background.template.jsonc", "web.template.jsonc"].map(
        (name) => readFile(new URL(name, templateRoot), "utf8"),
      ),
    );
    for (const [index, content] of templates.entries()) {
      for (const marker of HOSTED_MARKERS) {
        expect(
          content.includes(marker),
          `template ${index} contains hosted marker ${JSON.stringify(marker)}`,
        ).toBe(false);
      }
      expect(content).toMatch(/<[A-Z_]+>/);
    }
  });
});
