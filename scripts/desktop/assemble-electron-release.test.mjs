import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { parse, stringify } from "yaml";

const run = promisify(execFile);
const version = JSON.parse(await readFile("apps/desktop/package.json", "utf8")).version;

test("release assembly merges both signed Mac architectures and validates referenced files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "zilobase-release-assembly-"));
  const input = path.join(root, "candidates");
  const output = path.join(root, "release");
  async function candidate(name, feedName, assets) {
    const directory = path.join(input, name);
    await mkdir(directory, { recursive: true });
    for (const asset of assets) await writeFile(path.join(directory, asset), "candidate");
    await writeFile(path.join(directory, feedName), stringify({
      version, files: assets.map((url) => ({ url, sha512: "fixture", size: 9 })),
      path: assets[0], sha512: "fixture",
    }));
  }
  try {
    await candidate("mac-x64", "latest-mac.yml", ["zilobase-client-x64-mac.zip", "zilobase-client-x64.dmg", "zilobase-client-x64.pkg"]);
    await candidate("mac-arm64", "latest-mac.yml", ["zilobase-client-arm64-mac.zip", "zilobase-client-arm64.dmg", "zilobase-client-arm64.pkg"]);
    await candidate("windows-x64", "latest.yml", ["zilobase-client.exe", "zilobase-client.msi"]);
    await candidate("linux-x64", "latest-linux.yml", ["zilobase-client-x64.AppImage", "zilobase-client-x64.deb", "zilobase-client-x64.rpm"]);
    await candidate("linux-arm64", "latest-linux-arm64.yml", ["zilobase-client-arm64.AppImage", "zilobase-client-arm64.deb", "zilobase-client-arm64.rpm"]);
    await run(process.execPath, ["scripts/desktop/assemble-electron-release.mjs", input, output]);
    const macFeed = parse(await readFile(path.join(output, "latest-mac.yml"), "utf8"));
    assert.equal(macFeed.path, "zilobase-client-x64-mac.zip");
    assert.ok(macFeed.files.some((file) => file.url === "zilobase-client-arm64-mac.zip"));
    assert.ok(macFeed.files.some((file) => file.url === "zilobase-client-x64-mac.zip"));
    await unlink(path.join(input, "linux-arm64", "zilobase-client-arm64.AppImage"));
    await assert.rejects(
      () => run(process.execPath, ["scripts/desktop/assemble-electron-release.mjs", input, output]),
      /references missing asset zilobase-client-arm64\.AppImage/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
