// Materialize only the pre-optimization renderer/model into ignored benchmark artifacts.
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../..");
const ref = process.argv[2] ?? "74c3cbfd";
const output = path.join(root, ".dev/calendar-baseline");
for (const [source, target] of [
  ["apps/web/src/shared/components/calendar", "shared/components/calendar"],
  ["packages/features/src/calendar-layout", "core"],
]) {
  const files = execFileSync("git", ["ls-tree", "-r", "--name-only", ref, "--", source], {
    cwd: root,
    encoding: "utf8",
  })
    .trim()
    .split("\n");
  for (const file of files.filter(Boolean)) {
    const destination = path.join(output, target, path.relative(source, file));
    const text = execFileSync("git", ["show", `${ref}:${file}`], {
      cwd: root,
      encoding: "utf8",
    }).replaceAll('"@zilobase/features/calendar-layout"', '"../../../core/index"');
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, text);
  }
}
console.log(`Calendar baseline ${ref} prepared in ${output}`);
