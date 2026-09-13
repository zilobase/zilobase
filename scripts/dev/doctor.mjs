import { composeCheck } from "./docker.mjs";
import { runResult } from "./process.mjs";

export async function doctor() {
  const checks = await collectDependencyChecks();

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

export async function collectDependencyChecks() {
  const checks = [
    versionCheck("Node.js 24+", process.execPath, ["--version"], nodeVersionOk),
    versionCheck("npm 11+", "npm", ["--version"], majorAtLeast(11)),
    versionCheck("Docker", "docker", ["--version"]),
    composeCheck(),
    versionCheck("Docker Buildx (Kubernetes only)", "docker", ["buildx", "version"]),
    versionCheck("kubectl (Kubernetes only)", "kubectl", ["version", "--client=true"]),
    versionCheck("kind (Kubernetes only)", "kind", ["version"]),
    versionCheck("Helm (Kubernetes only)", "helm", ["version", "--short"]),
    gitHooksCheck(),
  ];
  return checks;
}

function gitHooksCheck() {
  const result = runResult("git", ["config", "--get", "core.hooksPath"]);
  const value = (result.stdout || "").trim();
  const ok = value === ".githooks" || value.endsWith("/.githooks");
  return {
    label: "Git commit and push hooks",
    required: false,
    ok,
    detail: ok ? value : "not installed (npm run hooks:install)",
  };
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
