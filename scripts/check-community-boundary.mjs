import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const root = process.cwd();
const execFileAsync = promisify(execFile);
const privateRuntimeMarkers = [
  ["cloud", "flare"].join(""),
  ["zilobase-", "cloud", "-adapter"].join(""),
  ["durable", " object"].join(""),
];
const violations = [];
const { stdout } = await execFileAsync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "buffer", maxBuffer: 16 * 1024 * 1024 },
);

for (const file of stdout.toString("utf8").split("\0")) {
  if (!file || path.basename(file) === "package-lock.json") continue;

  const content = await readFile(path.join(root, file));
  if (content.includes(0)) continue;

  const text = content.toString("utf8").toLowerCase();
  for (const marker of privateRuntimeMarkers) {
    if (text.includes(marker)) violations.push({ file, marker });
  }
}

if (violations.length > 0) {
  throw new Error(
    `Community boundary violation:\n${violations
      .map(({ file, marker }) => `- ${file}: private runtime marker ${marker}`)
      .join("\n")}`,
  );
}

console.info("Community deployment boundary is clean.");
