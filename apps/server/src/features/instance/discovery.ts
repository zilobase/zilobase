import { db, runWithDbEnv } from "../../infrastructure/database";
import {
  getCanonicalApiOrigin,
  getCanonicalWebOrigin,
  getStringEnv,
  type RuntimeEnv,
} from "../../shared/config/config";
import { ensureOfficialClipperClient } from "../auth/oauth-clients";
import { SERVER_VERSION } from "../../shared/version";
import type { EditionExtensionOptions } from "../../shared/types";
import {
  DESKTOP_PROTOCOL_VERSION,
  type InstanceSettingsRecord,
  type ZilobaseDiscoveryDocument,
} from "./contracts";
import { ensureInstanceSettings } from "./instance-settings";
import { assertSemanticVersion } from "./desktop-version";
type DiscoveryDependencies = {
  ensureOfficialClients?(webOrigin: string, env: RuntimeEnv): Promise<void>;
  getInstanceSettings(env: RuntimeEnv): Promise<InstanceSettingsRecord>;
};

const defaultDiscoveryDependencies: DiscoveryDependencies = {
  ensureOfficialClients(webOrigin, env) {
    return runWithDbEnv(env, () => ensureOfficialClipperClient(db, webOrigin));
  },
  getInstanceSettings(env) {
    return ensureInstanceSettings(env);
  },
};

export async function getZilobaseDiscoveryDocument(
  env: RuntimeEnv,
  dependencies: DiscoveryDependencies = defaultDiscoveryDependencies,
  options: EditionExtensionOptions = {},
): Promise<ZilobaseDiscoveryDocument> {
  const apiOrigin = getCanonicalApiOrigin(env);
  const webOrigin = getCanonicalWebOrigin(env);
  await dependencies.ensureOfficialClients?.(webOrigin, env);
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
    oauthAuthorization: {
      authorizationEndpoint: new URL("/api/auth/oauth2/authorize", apiOrigin).toString(),
      introspectionEndpoint: new URL("/api/auth/oauth2/introspect", apiOrigin).toString(),
      issuer: apiOrigin,
      jwksUri: new URL("/api/auth/jwks", apiOrigin).toString(),
      revocationEndpoint: new URL("/api/auth/oauth2/revoke", apiOrigin).toString(),
      tokenEndpoint: new URL("/api/auth/oauth2/token", apiOrigin).toString(),
    },
    ...(options.editionExtension
      ? {
          capabilities: [...options.editionExtension.capabilities],
          edition: options.editionExtension.id,
        }
      : {}),
  };
}
