import assert from "node:assert/strict";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse, stringify } from "yaml";

const [inputRoot, outputRoot] = process.argv.slice(2);
assert.ok(inputRoot && outputRoot, "Usage: node assemble-electron-release.mjs <artifacts> <output>");
const version = JSON.parse(await readFile("apps/desktop/package.json", "utf8")).version;
const metadataNames = new Set(["latest.yml", "latest-mac.yml", "latest-linux.yml", "latest-linux-arm64.yml"]);
const assetPattern = /\.(?:dmg|pkg|zip|exe|msi|AppImage|deb|rpm|blockmap)$/;
const feeds = new Map();
const assets = new Set();

await mkdir(outputRoot, { recursive: true });
for (const directory of await readdir(inputRoot, { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const source = path.join(inputRoot, directory.name);
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (metadataNames.has(entry.name)) {
      const feed = parse(await readFile(path.join(source, entry.name), "utf8"));
      assert.equal(feed.version, version, `Wrong version in ${directory.name}/${entry.name}`);
      assert.ok(Array.isArray(feed.files) && feed.files.length, `Empty update feed in ${directory.name}`);
      const existing = feeds.get(entry.name) ?? [];
      existing.push(feed);
      feeds.set(entry.name, existing);
      continue;
    }
    if (!assetPattern.test(entry.name)) continue;
    assert.ok(!assets.has(entry.name), `Duplicate release asset: ${entry.name}`);
    assets.add(entry.name);
    await copyFile(path.join(source, entry.name), path.join(outputRoot, entry.name));
  }
}

for (const name of ["latest.yml", "latest-mac.yml", "latest-linux.yml", "latest-linux-arm64.yml"]) {
  const candidates = feeds.get(name) ?? [];
  assert.equal(candidates.length, name === "latest-mac.yml" ? 2 : 1,
    `Expected ${name === "latest-mac.yml" ? "two" : "one"} ${name} candidate feed(s)`);
  const feed = candidates[0];
  if (name === "latest-mac.yml") {
    const files = candidates.flatMap((candidate) => candidate.files);
    assert.ok(files.some((file) => file.url.endsWith("-mac.zip") && !file.url.includes("arm64")),
      "Intel macOS update ZIP is missing");
    assert.ok(files.some((file) => file.url.endsWith("-mac.zip") && file.url.includes("arm64")),
      "ARM macOS update ZIP is missing");
    feed.files = files;
    const intelZip = files.find((file) => file.url.endsWith("-mac.zip") && !file.url.includes("arm64"));
    feed.path = intelZip.url;
    feed.sha512 = intelZip.sha512;
  }
  for (const file of feed.files) {
    assert.ok(assets.has(file.url), `Update feed ${name} references missing asset ${file.url}`);
  }
  await writeFile(path.join(outputRoot, name), stringify(feed));
}

for (const extension of [".dmg", ".pkg", ".exe", ".msi", ".AppImage", ".deb", ".rpm"]) {
  assert.ok([...assets].some((name) => name.endsWith(extension)), `Missing ${extension} release asset`);
}
console.info(`Electron release assets assembled for ${version}: ${assets.size} installers and support files.`);
