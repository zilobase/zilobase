import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
execFileSync("cargo", ["build", "--release", "--manifest-path", path.join(root, "Cargo.toml")], {
  stdio: "inherit",
});
const name = "zilobase-desktop-sidecar" + (process.platform === "win32" ? ".exe" : "");
const source = path.join(root, "target", "release", name);
const destination = path.join(root, "..", "bin");
mkdirSync(destination, { recursive: true });
copyFileSync(source, path.join(destination, name));
