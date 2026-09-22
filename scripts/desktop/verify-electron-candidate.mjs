import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const mode = process.argv[2];
assert.ok(mode === "preflight" || mode === "verify", "Use preflight or verify");
const signed = process.env.ZILOBASE_REQUIRE_SIGNING === "true";

if (mode === "preflight") {
  if (signed) {
    const required = process.platform === "darwin"
      ? ["CSC_LINK", "CSC_KEY_PASSWORD", "CSC_INSTALLER_LINK", "CSC_INSTALLER_KEY_PASSWORD", "APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"]
      : process.platform === "win32"
        ? ["WIN_CSC_LINK", "WIN_CSC_KEY_PASSWORD"]
        : [];
    const missing = required.filter((name) => !process.env[name]);
    assert.equal(missing.length, 0, `Missing signing secrets: ${missing.join(", ")}`);
  }
  console.info(`Electron ${signed ? "signed" : "unsigned"} candidate preflight passed.`);
  process.exit(0);
}

const root = path.resolve(process.env.ZILOBASE_ELECTRON_DIST_DIR || "apps/desktop/dist-electron");
const version = JSON.parse(readFileSync("apps/desktop/package.json", "utf8")).version;
const entries = readdirSync(root);
const target = process.platform === "darwin"
  ? { extensions: [".dmg", ".pkg", "-mac.zip"], updateFile: "latest-mac.yml", unpacked: "mac" }
  : process.platform === "win32"
    ? { extensions: [".exe", ".msi"], updateFile: "latest.yml", unpacked: "win" }
    : { extensions: [".AppImage", ".deb", ".rpm"],
      updateFile: process.arch === "arm64" ? "latest-linux-arm64.yml" : "latest-linux.yml",
      unpacked: "linux" };

for (const extension of target.extensions) {
  const found = entries.find((name) => name.includes(version) && name.endsWith(extension) &&
    statSync(path.join(root, name)).size > 0);
  assert.ok(found, `Missing nonempty Electron ${extension} installer for ${version}`);
}
const metadata = path.join(root, target.updateFile);
assert.ok(existsSync(metadata), `Missing ${target.updateFile} update feed`);
assert.ok(readFileSync(metadata, "utf8").includes(version), "Update feed has the wrong version");

const unpacked = entries.find((name) => name.startsWith(target.unpacked) &&
  (process.platform === "darwin" ? /^mac(?:-arm64)?$/.test(name) : name.endsWith("-unpacked")) &&
  existsSync(path.join(root, name)));
assert.ok(unpacked, "Missing unpacked Electron app");
const appRoot = path.join(root, unpacked);
const sidecarName = "zilobase-desktop-sidecar" + (process.platform === "win32" ? ".exe" : "");
const sidecar = process.platform === "darwin"
  ? path.join(appRoot, "zilobase-client.app", "Contents", "Resources", "sidecar", sidecarName)
  : path.join(appRoot, "resources", "sidecar", sidecarName);
assert.ok(existsSync(sidecar) && statSync(sidecar).size > 0, "Native capture sidecar is missing from the package");

if (signed && process.platform === "darwin") {
  const appBundle = path.join(appRoot, "zilobase-client.app");
  execFileSync("codesign", ["--verify", "--deep", "--strict", appBundle], { stdio: "inherit" });
  execFileSync("xcrun", ["stapler", "validate", appBundle], { stdio: "inherit" });
  const pkg = entries.find((name) => name.includes(version) && name.endsWith(".pkg"));
  const signature = execFileSync("pkgutil", ["--check-signature", path.join(root, pkg)], { encoding: "utf8" });
  assert.match(signature, /Developer ID Installer/, "PKG is not signed by a Developer ID Installer certificate");
}
if (signed && process.platform === "win32") {
  const files = [path.join(appRoot, "zilobase-client.exe"), sidecar,
    ...entries.filter((name) => name.includes(version) && /\.(exe|msi)$/.test(name)).map((name) => path.join(root, name))];
  for (const file of files) {
    const status = execFileSync("powershell.exe", ["-NoProfile", "-Command",
      "(Get-AuthenticodeSignature -FilePath $env:ZILOBASE_WINDOWS_VERIFY_FILE).Status.ToString()"], {
      encoding: "utf8", env: { ...process.env, ZILOBASE_WINDOWS_VERIFY_FILE: file },
    }).trim();
    assert.equal(status, "Valid", `Windows signature is not valid: ${path.basename(file)}`);
  }
}

console.info(`Electron ${signed ? "signed" : "unsigned"} candidate artifacts verified for ${process.platform}/${process.arch}.`);
