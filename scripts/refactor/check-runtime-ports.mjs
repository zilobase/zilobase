import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const featureRoots = ["apps/server/src/features", "packages/features/src"];
const runtimeRoots = ["apps/server/src", "packages/runtime-adapter/src"];
const retiredRuntimeFiles = [
  "apps/server/src/app/node/node-runtime.ts",
  "apps/server/src/infrastructure/node/realtime-bus.ts",
  "apps/server/src/infrastructure/runtime/runtime-adapter.ts",
  "apps/server/src/infrastructure/runtime/runtime-context.ts",
];
const forbidden = [
  ["ambient runtime adapter", /\b(?:get|runWith|set)RuntimeAdapter\b/],
  ["legacy runtime adapter contract", /\bServerRuntimeAdapter\b/],
  ["runtime policy inference", /\bisSelfHostedRuntime\b/],
  ["Node runtime provider import", /@zilobase\/runtime-adapter\/node(?:[/'"]|$)/],
  ["Worker runtime provider import", /@zilobase\/runtime-adapter\/worker(?:[/'"]|$)/],
  ["Worker binding selection", /\b(?:HYPERDRIVE|IMAGE_BUCKET|WebSocketPair)\b/],
];
const retiredRuntimePatterns = [
  ["ambient runtime port setter", /\bsetRuntimePorts\b/],
  ["nullable Node realtime bus", /\bNodeRealtimeBus\s*\|\s*null\b/],
];

export function checkRuntimeBoundaries(repositoryRoot = root) {
  const errors = [];
  for (const featureRoot of featureRoots) {
    for (const file of sourceFiles(join(repositoryRoot, featureRoot))) {
      const source = readFileSync(file, "utf8");
      for (const [label, pattern] of forbidden) {
        if (pattern.test(source)) errors.push(`${relative(repositoryRoot, file)}: ${label}`);
      }
    }
  }
  for (const runtimeRoot of runtimeRoots) {
    for (const file of sourceFiles(join(repositoryRoot, runtimeRoot))) {
      const source = readFileSync(file, "utf8");
      for (const [label, pattern] of retiredRuntimePatterns) {
        if (pattern.test(source)) errors.push(`${relative(repositoryRoot, file)}: ${label}`);
      }
    }
  }
  for (const retiredFile of retiredRuntimeFiles) {
    if (existsSync(join(repositoryRoot, retiredFile))) {
      errors.push(`${retiredFile}: retired runtime compatibility shim`);
    }
  }
  return errors;
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) && !/\.test\.(?:ts|tsx)$/.test(entry.name)
      ? [path]
      : [];
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = checkRuntimeBoundaries();
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Feature runtime-port boundaries are clean");
  }
}
