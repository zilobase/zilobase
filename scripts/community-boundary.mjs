const deployablePathPattern = /^(?:Dockerfile$|apps\/|docker\/|deploy\/|packages\/)/;
const operationalPathPattern = /^(?:\.github\/|\.vscode\/|package\.json$|scripts\/)/;
const sourceFilePattern = /\.(?:[cm]?[jt]sx?)$/;
const importPattern = /(?:\bfrom|\bimport\s*\(|\brequire\s*\()\s*["']([^"']+)["']/g;
const privateFeatureTermPattern = /\b(?:SSO|Enterprise)\b/giu;

const boundaryPolicyFiles = new Set([
  "architecture/platform/edition-integration.md",
  "scripts/check-community-boundary.mjs",
  "scripts/community-boundary.mjs",
  "scripts/community-boundary.test.mjs",
]);

function configuredMarkers() {
  return (process.env.ZILOBASE_RESTRICTED_PACKAGE_MARKERS ?? "")
    .split(",")
    .map((marker) => marker.trim().toLowerCase())
    .filter(Boolean);
}

function configuredPathPattern() {
  const source = process.env.ZILOBASE_RESTRICTED_PATH_PATTERN?.trim();
  return source ? new RegExp(source, "iu") : null;
}

function isRestrictedPackage(specifier) {
  const normalized = specifier.toLowerCase();
  return configuredMarkers().some((marker) => normalized.includes(marker));
}

export function isVendoredReferenceTree(file) {
  const normalizedFile = file.replaceAll("\\", "/");
  return normalizedFile === "repos" || normalizedFile.startsWith("repos/") ||
    normalizedFile === ".claude" || normalizedFile.startsWith(".claude/");
}

export function findRestrictedRuntimeReferences(file, content) {
  const normalizedFile = file.replaceAll("\\", "/");
  if (isVendoredReferenceTree(normalizedFile)) return [];

  if (!isBoundaryPolicyFile(normalizedFile)) {
    const privateFeatureTerms = [...content.matchAll(privateFeatureTermPattern)]
      .map((match) => match[0].toUpperCase());
    if (privateFeatureTerms.length > 0) {
      return [...new Set(privateFeatureTerms)]
        .map((term) => `private feature implementation term: ${term}`);
    }
  }

  const pathPattern = configuredPathPattern();
  if (
    pathPattern &&
    !isBoundaryImplementation(normalizedFile) &&
    (
      pathPattern.test(normalizedFile) ||
      (
        (deployablePathPattern.test(normalizedFile) || operationalPathPattern.test(normalizedFile)) &&
        pathPattern.test(content)
      )
    )
  ) {
    return ["restricted runtime marker"];
  }

  if (pathBasename(file) === "package.json") {
    const manifest = JSON.parse(content);
    return [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ].filter(isRestrictedPackage);
  }

  if (!sourceFilePattern.test(file)) return [];
  return [...content.matchAll(importPattern)]
    .map((match) => match[1])
    .filter((specifier) => specifier && isRestrictedPackage(specifier));
}

function isBoundaryImplementation(file) {
  return file.startsWith("scripts/") && isBoundaryPolicyFile(file);
}

function isBoundaryPolicyFile(file) {
  return boundaryPolicyFiles.has(file);
}

export function isMissingWorkingTreeFile(error) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function pathBasename(file) {
  return file.slice(Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\")) + 1);
}
