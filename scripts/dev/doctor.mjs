import { adapterDir } from "./config.mjs";
import { runResult } from "./process.mjs";
import { access } from "node:fs/promises";
import path from "node:path";

export async function doctor() {
  const checks = [
    versionCheck("Node.js 24+", process.execPath, ["--version"], nodeVersionOk),
    versionCheck("npm 11+", "npm", ["--version"], majorAtLeast(11)),
    versionCheck("Docker", "docker", ["--version"]),
    versionCheck("Docker Compose", "docker", ["compose", "version"]),
    versionCheck("Docker Buildx (Kubernetes only)", "docker", ["buildx", "version"]),
    versionCheck("kubectl (Kubernetes only)", "kubectl", ["version", "--client=true"]),
    versionCheck("kind (Kubernetes only)", "kind", ["version"]),
    versionCheck("Helm (Kubernetes only)", "helm", ["version", "--short"]),
  ];
  const repositories = [
    ["Cloud adapter", adapterDir],
  ];
  for (const [label, directory] of repositories) {
    checks.push({
      label,
      required: false,
      ok: await exists(path.join(directory, "package.json")),
      detail: directory,
    });
  }

  for (const check of checks) {
    console.info(`${check.ok ? "✓" : check.required === false ? "○" : "✗"} ${check.label}: ${check.detail}`);
  }
  const requiredFailures = checks.filter((check) => check.required !== false && !check.ok);
  const kubeMissing = checks.filter((check) => check.label.includes("Kubernetes only") && !check.ok);
  if (kubeMissing.length) {
    console.info("\nKubernetes tooling is optional. On macOS: brew install kubectl kind helm");
  }
  if (requiredFailures.length) throw new Error("Required local-development prerequisites are missing.");
}

function versionCheck(label, executable, args, validate = () => true) {
  const result = runResult(executable, args);
  const detail = (result.stdout || result.stderr || result.error?.message || "not installed").trim();
  return {
    label,
    required: !label.includes("Kubernetes only"),
    ok: result.status === 0 && validate(detail),
    detail,
  };
}

function nodeVersionOk(value) {
  return Number(value.match(/v?(\d+)/)?.[1]) >= 24;
}

function majorAtLeast(minimum) {
  return (value) => Number(value.match(/(\d+)/)?.[1]) >= minimum;
}

async function exists(filename) {
  try { await access(filename); return true; } catch { return false; }
}
