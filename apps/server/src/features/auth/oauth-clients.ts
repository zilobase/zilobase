import { eq } from "drizzle-orm";

import type { Database } from "../../infrastructure/database";
import { oauthClient } from "../../infrastructure/database/schema";
import { OAUTH_SCOPES } from "./oauth";

export const OFFICIAL_CLIPPER_CLIENT_ID = "zilobase-web-clipper";

export function officialClipperRedirectUris(webOrigin: string) {
  const callback = `${webOrigin.replace(/\/$/, "")}/oauth/callback`;
  const localCallback = "http://localhost:1420/oauth/callback";
  return callback === localCallback ? [callback] : [callback, localCallback];
}

export async function ensureOfficialClipperClient(database: Database, webOrigin: string) {
  const [existing] = await database
    .select({ id: oauthClient.id })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, OFFICIAL_CLIPPER_CLIENT_ID))
    .limit(1);

  if (existing) {
    return;
  }

  await database
    .insert(oauthClient)
    .values({
      applicationType: "native",
      clientCredentialsScopes: [],
      clientId: OFFICIAL_CLIPPER_CLIENT_ID,
      disabled: false,
      grantTypes: ["authorization_code", "refresh_token"],
      id: "oauth_client_zilobase_web_clipper",
      name: "Zilobase Web Clipper",
      redirectUris: officialClipperRedirectUris(webOrigin),
      requirePKCE: true,
      responseTypes: ["code"],
      scopes: [...OAUTH_SCOPES],
      skipConsent: false,
      tokenEndpointAuthMethod: "none",
    })
    .onConflictDoNothing({ target: oauthClient.clientId });
}
