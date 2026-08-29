import { eq } from "drizzle-orm";

import {
  getCanonicalApiOrigin,
  getCanonicalWebOrigin,
  getStringEnv,
  type RuntimeEnv,
} from "../../shared/config/config";
import { db, runWithDbEnv } from "../../infrastructure/database";
import { instanceSettings as instanceSettingsTable } from "../../infrastructure/database/schema";
import { SERVER_VERSION } from "../../shared/version";
import type { EditionExtensionOptions } from "../../shared/types";

export const DESKTOP_PROTOCOL_VERSION = 1 as const;
export const INSTANCE_SETTINGS_ROW_ID = "primary";

export type DesktopServer = {
  instanceId: string;
  displayName: string;
  issuer: string;
  webOrigin: string;
  apiOrigin: string;
  protocolVersion: typeof DESKTOP_PROTOCOL_VERSION;
  serverVersion: string;
  minimumDesktopVersion: string;
};

export type ZilobaseDiscoveryDocument = DesktopServer & {
  capabilities?: readonly string[];
  desktopAuthorization: {
    authorizationEndpoint: string;
    tokenEndpoint: string;
  };
  edition?: "enterprise";
};

export type InstanceSettingsRecord = {
  displayName: string;
  instanceId: string;
};

type InstanceSettingsRepository = {
  create(record: InstanceSettingsRecord): Promise<void>;
  find(): Promise<InstanceSettingsRecord | null>;
};

type DiscoveryDependencies = {
  getInstanceSettings(env: RuntimeEnv): Promise<InstanceSettingsRecord>;
};

const databaseInstanceSettingsRepository: InstanceSettingsRepository = {
  async create(record) {
    await db
      .insert(instanceSettingsTable)
      .values({
        id: INSTANCE_SETTINGS_ROW_ID,
        ...record,
      })
      .onConflictDoNothing({ target: instanceSettingsTable.id });
  },
  async find() {
    const [settings] = await db
      .select({
        displayName: instanceSettingsTable.displayName,
        instanceId: instanceSettingsTable.instanceId,
      })
      .from(instanceSettingsTable)
      .where(eq(instanceSettingsTable.id, INSTANCE_SETTINGS_ROW_ID))
      .limit(1);

    return settings ?? null;
  },
};

const defaultDiscoveryDependencies: DiscoveryDependencies = {
  getInstanceSettings(env) {
    return ensureInstanceSettings(env);
  },
};

export function ensureInstanceSettings(env: RuntimeEnv) {
  return runWithDbEnv(env, () =>
    getOrCreateInstanceSettings(
      resolveInitialDisplayName(env),
      databaseInstanceSettingsRepository,
    ),
  );
}

export async function getZilobaseDiscoveryDocument(
  env: RuntimeEnv,
  dependencies: DiscoveryDependencies = defaultDiscoveryDependencies,
  options: EditionExtensionOptions = {},
): Promise<ZilobaseDiscoveryDocument> {
  const apiOrigin = getCanonicalApiOrigin(env);
  const webOrigin = getCanonicalWebOrigin(env);
  const minimumDesktopVersion =
    getStringEnv(env, "ZILOBASE_MINIMUM_DESKTOP_VERSION") ?? SERVER_VERSION;

  assertSemanticVersion(SERVER_VERSION, "server version");
  assertSemanticVersion(minimumDesktopVersion, "minimum desktop version");

  const settings = await dependencies.getInstanceSettings(env);

  return {
    instanceId: settings.instanceId,
    displayName: settings.displayName,
    issuer: apiOrigin,
    webOrigin,
    apiOrigin,
    protocolVersion: DESKTOP_PROTOCOL_VERSION,
    serverVersion: SERVER_VERSION,
    minimumDesktopVersion,
    desktopAuthorization: {
      authorizationEndpoint: new URL("/desktop/authorize", apiOrigin).toString(),
      tokenEndpoint: new URL("/api/auth/desktop/token", apiOrigin).toString(),
    },
    ...(options.editionExtension
      ? {
          capabilities: [...options.editionExtension.capabilities],
          edition: options.editionExtension.id,
        }
      : {}),
  };
}

export async function getOrCreateInstanceSettings(
  initialDisplayName: string,
  repository: InstanceSettingsRepository = databaseInstanceSettingsRepository,
) {
  const existing = await repository.find();

  if (existing) {
    return existing;
  }

  await repository.create({
    displayName: initialDisplayName,
    instanceId: crypto.randomUUID(),
  });

  const persisted = await repository.find();

  if (!persisted) {
    throw new Error("Unable to initialize instance settings");
  }

  return persisted;
}

export function isDesktopVersionCompatible(
  discovery: Pick<
    DesktopServer,
    "minimumDesktopVersion" | "protocolVersion"
  >,
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

function resolveInitialDisplayName(env: RuntimeEnv) {
  const displayName =
    getStringEnv(env, "ZILOBASE_INSTANCE_NAME")?.trim() ?? "Zilobase";

  if (!displayName || displayName.length > 100) {
    throw new Error(
      "ZILOBASE_INSTANCE_NAME must contain between 1 and 100 characters",
    );
  }

  return displayName;
}

function assertSemanticVersion(value: string, label: string) {
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
        (/^\d+$/.test(identifier) &&
          identifier.length > 1 &&
          identifier.startsWith("0")),
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
