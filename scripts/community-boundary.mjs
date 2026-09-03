const privatePackageMarkers = [
  "cloudflare",
  "@zilobase/cloud-adapter",
  "zilobase-cloud-adapter",
  "@zilobase/enterprise",
  "zilobase-enterprise",
  "@zilobase/console",
  "zilobase-console",
];
const privateRepositoryPattern = /\b(?:enterprise|zilobase-console)\b/i;
const deployablePathPattern = /^(?:Dockerfile$|apps\/|docker\/|deploy\/|packages\/)/;
const operationalPathPattern = /^(?:\.github\/|\.vscode\/|package\.json$|scripts\/)/;
const sourceFilePattern = /\.(?:[cm]?[jt]sx?)$/;
const importPattern = /(?:\bfrom|\bimport\s*\(|\brequire\s*\()\s*["']([^"']+)["']/g;

function isPrivatePackage(specifier) {
  const normalized = specifier.toLowerCase();
  return privatePackageMarkers.some((marker) => normalized.includes(marker));
}

export function findPrivateRuntimeReferences(file, content) {
  const normalizedFile = file.replaceAll("\\", "/");
  if (
    !isBoundaryImplementation(normalizedFile) &&
    (
      privateRepositoryPattern.test(normalizedFile) ||
      (
        (deployablePathPattern.test(normalizedFile) || operationalPathPattern.test(normalizedFile)) &&
        privateRepositoryPattern.test(content)
      )
    )
  ) {
    return ["private-edition repository marker"];
  }

  if (pathBasename(file) === "package.json") {
    const manifest = JSON.parse(content);
    return [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ].filter(isPrivatePackage);
  }

  if (!sourceFilePattern.test(file)) return [];
  return [...content.matchAll(importPattern)]
    .map((match) => match[1])
    .filter((specifier) => specifier && isPrivatePackage(specifier));
}

function isBoundaryImplementation(file) {
  return file === "scripts/community-boundary.mjs" ||
    file === "scripts/community-boundary.test.mjs" ||
    file === "scripts/check-community-boundary.mjs";
}

export function isMissingWorkingTreeFile(error) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function pathBasename(file) {
  return file.slice(Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\")) + 1);
}
