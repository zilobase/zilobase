import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  findPrivateRuntimeReferences,
  isMissingWorkingTreeFile,
} from "./community-boundary.mjs";

const root = process.cwd();
const execFileAsync = promisify(execFile);
const violations = [];
const { stdout } = await execFileAsync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "buffer", maxBuffer: 16 * 1024 * 1024 },
);

for (const file of stdout.toString("utf8").split("\0")) {
  if (
    !file
    || file.includes(".test.")
    || path.basename(file) === "package-lock.json"
  ) continue;

  let content;
  try {
    content = await readFile(path.join(root, file));
  } catch (error) {
    if (isMissingWorkingTreeFile(error)) continue;
    throw error;
  }
  if (content.includes(0)) continue;

  for (const reference of findPrivateRuntimeReferences(file, content.toString("utf8"))) {
    violations.push({ file, reference });
  }
}

if (violations.length > 0) {
  throw new Error(
    `Community boundary violation:\n${violations
      .map(({ file, reference }) => `- ${file}: private runtime dependency ${reference}`)
      .join("\n")}`,
  );
}

console.info("Community deployment boundary is clean.");
