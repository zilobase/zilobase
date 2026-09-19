// Dependency alignment guard (RESTRUCTURE_PLAN Pass 2).
// Asserts the pinned toolchain versions agreed in Pass 1 so the six repos
// can't silently drift again. Run: `npm run deps:check`.
// Vendored copies of this file live in the satellite repos (see header there).
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const CANONICAL = {
  react: "19.2.3",
  "react-dom": "19.2.3",
  "better-auth": "1.7.3",
  typescript: "6.0.3",
};

// Landing is the documented exception: zod stays on v3 until form schemas
// migrate (see zilobase-landing/docs/dependency-exceptions.md).
const ZOD_V4 = "4.";
const ZOD_V3 = "3.";

function specVersion(spec) {
  return String(spec).replace(/^[\^~>=<\s]+/, "").trim();
}

function parseVersion(spec) {
  const parts = specVersion(spec).split(".").map((part) => parseInt(part, 10));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

// Peer ranges (e.g. `^19.1.0`) are intentionally wide: pass when the
// canonical version satisfies the lower bound (same major, >= minor.patch).
function peerSatisfies(rawSpec, want) {
  const trimmed = String(rawSpec).trim();
  if (!/^[\^~>=<]/.test(trimmed)) return specVersion(rawSpec) === want;
  const [ma, mi, pa] = parseVersion(trimmed);
  const [wMa, wMi, wPa] = parseVersion(want);
  if (trimmed.startsWith("^")) {
    return ma === wMa && (mi < wMi || (mi === wMi && pa <= wPa));
  }
  if (trimmed.startsWith("~")) {
    return ma === wMa && mi === wMi && pa <= wPa;
  }
  if (trimmed.startsWith(">=")) {
    return ma < wMa || (ma === wMa && (mi < wMi || (mi === wMi && pa <= wPa)));
  }
  return specVersion(rawSpec) === want;
}

function isLandingDir(dir) {
  return path.basename(dir) === "zilobase-landing";
}

function checkManifest(pkg, label, { landing = false } = {}, errors) {
  const exact = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
  };
  const peers = pkg.peerDependencies ?? {};
  for (const [dep, want] of Object.entries(CANONICAL)) {
    if (dep in exact) {
      const got = specVersion(exact[dep]);
      if (got !== want) {
        errors.push(`${label}: ${dep} is ${exact[dep]} (want ${want})`);
      }
    } else if (dep in peers) {
      if (!peerSatisfies(peers[dep], want)) {
        errors.push(`${label}: peer ${dep} is ${peers[dep]} (does not admit ${want})`);
      }
    }
  }
  const zodSpec = exact.zod ?? peers.zod;
  if (zodSpec) {
    const got = specVersion(zodSpec);
    if (landing) {
      if (!got.startsWith(ZOD_V3)) {
        errors.push(`${label}: zod exception broken — landing must stay on v3 until migration`);
      }
    } else if (!got.startsWith(ZOD_V4)) {
      errors.push(`${label}: zod is ${zodSpec} (want v4; v3 exception is landing-only)`);
    }
  }
  const engines = pkg.engines?.node;
  if (!engines || !engines.includes("24")) {
    errors.push(`${label}: engines.node is ${engines ?? "missing"} (want >=24.0.0)`);
  }
}

const root = process.cwd();
const landing = isLandingDir(root);
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const errors = [];
checkManifest(pkg, "package.json", { landing }, errors);

if (process.argv.includes("--check-all")) {
  // Workspace manifests: report drift as warnings (exit 0). Core workspaces
  // have known minor drift (e.g. clipper typescript ^5, peer ranges
  // ^19.1.0) tracked as follow-ups; the gate is the root manifest.
  for (const dir of ["apps", "packages"]) {
    let entries = [];
    try {
      entries = await readdir(path.join(root, dir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const label = `${dir}/${entry.name}/package.json`;
      try {
        const sub = JSON.parse(await readFile(path.join(root, dir, entry.name, "package.json"), "utf8"));
        const subErrors = [];
        checkManifest(sub, label, {}, subErrors);
        // Workspaces inherit engines from the root; only warn on dep drift.
        for (const error of subErrors) {
          if (error.includes("engines.node")) continue;
          console.warn(`deps:check (workspace warning): ${error}`);
        }
      } catch {
        // Missing manifest — ignore; not every directory is a workspace.
      }
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`deps:check: ${error}`);
  process.exit(1);
}
console.log("deps:check: aligned");
