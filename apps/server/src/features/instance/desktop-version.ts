import { DESKTOP_PROTOCOL_VERSION, type DesktopServer } from "./contracts";
export function isDesktopVersionCompatible(
  discovery: Pick<DesktopServer, "minimumDesktopVersion" | "protocolVersion">,
  desktopVersion: string,
) {
  if (discovery.protocolVersion !== DESKTOP_PROTOCOL_VERSION) {
    return false;
  }

  const current = parseSemanticVersion(desktopVersion);
  const minimum = parseSemanticVersion(discovery.minimumDesktopVersion);

  if (!current || !minimum) {
    return false;
  }

  for (let index = 0; index < 3; index += 1) {
    if (current.core[index] !== minimum.core[index]) {
      return current.core[index] > minimum.core[index];
    }
  }

  if (!current.prerelease && minimum.prerelease) {
    return true;
  }

  if (current.prerelease && !minimum.prerelease) {
    return false;
  }

  if (!current.prerelease || !minimum.prerelease) {
    return true;
  }

  return comparePrerelease(current.prerelease, minimum.prerelease) >= 0;
}

export function assertSemanticVersion(value: string, label: string) {
  if (!parseSemanticVersion(value)) {
    throw new Error(`${label} must be a semantic version`);
  }
}

function parseSemanticVersion(value: string) {
  const match = value.match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/,
  );

  if (!match) {
    return null;
  }

  const prerelease = match[4]?.split(".") ?? null;

  if (
    prerelease?.some(
      (identifier) =>
        !identifier ||
        !/^[0-9A-Za-z-]+$/.test(identifier) ||
        (/^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith("0")),
    )
  ) {
    return null;
  }

  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease,
  };
}

function comparePrerelease(current: string[], minimum: string[]) {
  const length = Math.max(current.length, minimum.length);

  for (let index = 0; index < length; index += 1) {
    const currentIdentifier = current[index];
    const minimumIdentifier = minimum[index];

    if (currentIdentifier === undefined) return -1;
    if (minimumIdentifier === undefined) return 1;
    if (currentIdentifier === minimumIdentifier) continue;

    const currentIsNumber = /^\d+$/.test(currentIdentifier);
    const minimumIsNumber = /^\d+$/.test(minimumIdentifier);

    if (currentIsNumber && minimumIsNumber) {
      return Number(currentIdentifier) - Number(minimumIdentifier);
    }

    if (currentIsNumber !== minimumIsNumber) {
      return currentIsNumber ? -1 : 1;
    }

    return currentIdentifier < minimumIdentifier ? -1 : 1;
  }

  return 0;
}
