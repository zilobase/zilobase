const privatePackageMarkers = [
  "cloudflare",
  "@zilobase/cloud-adapter",
  "zilobase-cloud-adapter",
];
const sourceFilePattern = /\.(?:[cm]?[jt]sx?)$/;
const importPattern = /(?:\bfrom|\bimport\s*\(|\brequire\s*\()\s*["']([^"']+)["']/g;

function isPrivatePackage(specifier) {
  const normalized = specifier.toLowerCase();
  return privatePackageMarkers.some((marker) => normalized.includes(marker));
}

export function findPrivateRuntimeReferences(file, content) {
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

function pathBasename(file) {
  return file.slice(Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\")) + 1);
}
