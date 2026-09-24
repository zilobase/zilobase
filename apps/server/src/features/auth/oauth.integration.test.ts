import { test } from "vitest";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createAuth } from "./auth";
import { runWithDb } from "../../infrastructure/database";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../../infrastructure/database/schema";
import { eq } from "drizzle-orm";
import { decodeJwt } from "jose";
import { resolveOAuthBearer } from "./oauth-access";
test.skipIf(!process.env.OAUTH_TEST_DATABASE_URL)(
  "real provider grants stay pinned and revoked consent blocks refresh",
  async () => {
    const client = new Client({
      connectionString: process.env.OAUTH_TEST_DATABASE_URL!,
      connectionTimeoutMillis: 30000,
    });
    const conn = { client, db: drizzle(client, { schema }) };
    await conn.client.connect();
    try {
      await runWithDb(conn.db, async () => {
        const origin = "https://api.example.com";
        const env = {
          BETTER_AUTH_SECRET:
            process.env.OAUTH_TEST_AUTH_SECRET ?? "isolated-oauth-integration-test-secret",
          BETTER_AUTH_URL: origin,
          CLIENT_URL: "https://app.example.com",
        };
        const auth = await createAuth(env, new Request(origin), conn.db);
        const workspaceId = randomUUID();
        await conn.db
          .insert(schema.workspace)
          .values({ id: workspaceId, name: "Smoke workspace", slug: workspaceId });
        const uid = randomUUID();
        const token = randomUUID();
        const sid = randomUUID();
        await conn.db.insert(schema.user).values({
          id: uid,
          name: "OAuth smoke",
          email: `${uid}@example.com`,
          emailVerified: true,
        });
        await conn.db
          .insert(schema.member)
          .values({ id: randomUUID(), organizationId: workspaceId, userId: uid, role: "owner" });
        await conn.db.insert(schema.session).values({
          id: sid,
          token,
          userId: uid,
          activeWorkspaceId: workspaceId,
          expiresAt: new Date(Date.now() + 3600000),
        });
        const headers = { authorization: `Bearer ${token}`, origin: "https://app.example.com" };
        async function request(
          path: string,
          body?: unknown,
          customHeaders?: Record<string, string>,
        ) {
          const response = await auth.handler(
            new Request(origin + "/api/auth" + path, {
              method: body ? "POST" : "GET",
              headers: {
                ...headers,
                ...customHeaders,
                ...(body ? { "content-type": "application/json" } : {}),
              },
              ...(body ? { body: JSON.stringify(body) } : {}),
            }),
          );
          const text = await response.text();
          return {
            response,
            json:
              text && response.headers.get("content-type")?.includes("json")
                ? JSON.parse(text)
                : null,
          };
        }
        const registered = await request("/oauth2/create-client", {
          client_name: "Smoke",
          redirect_uris: ["https://client.example.com/callback"],
          application_type: "native",
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code", "refresh_token"],
        });
        assert.equal(registered.response.status, 201);
        const clientId = registered.json.client_id;
        const verifier = "test-code-verifier-".repeat(4);
        const query = new URLSearchParams({
          client_id: clientId,
          redirect_uri: "https://client.example.com/callback",
          response_type: "code",
          scope: "openid offline_access pages.read",
          resource: origin,
          state: "smoke",
          code_challenge_method: "S256",
          code_challenge: createHash("sha256").update(verifier).digest("base64url"),
          prompt: "consent",
        });
        const authorization = await request("/oauth2/authorize?" + query);
        const consentUrl =
          authorization.response.headers.get("location") ?? authorization.json?.url;
        assert.ok(consentUrl, "authorize redirects to consent");
        const signedQuery = new URL(consentUrl).search.slice(1);
        const consent = await request("/oauth2/consent", {
          accept: true,
          oauth_query: signedQuery,
        });
        assert.equal(consent.response.status, 200);
        const code = new URL(consent.json.url).searchParams.get("code");
        assert.ok(code);
        async function exchange(fields: Record<string, string>) {
          const response = await auth.handler(
            new Request(origin + "/api/auth/oauth2/token", {
              method: "POST",
              headers: { "content-type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams(fields),
            }),
          );
          const json = await response.json();
          return { response, json };
        }
        const initial = await exchange({
          grant_type: "authorization_code",
          client_id: clientId,
          redirect_uri: "https://client.example.com/callback",
          code: code!,
          code_verifier: verifier,
        });
        assert.equal(initial.response.status, 200);
        assert.equal(decodeJwt(initial.json.access_token).workspace_id, workspaceId);
        assert.ok(initial.json.refresh_token);
        assert.equal(decodeJwt(initial.json.access_token).iss, origin);
        const verified = await resolveOAuthBearer({
          apiOrigin: origin,
          requestedWorkspaceId: null,
          token: initial.json.access_token,
        });
        assert.ok(!("status" in verified), JSON.stringify(verified));
        await conn.db
          .update(schema.session)
          .set({ activeWorkspaceId: "workspace-b" })
          .where(eq(schema.session.id, sid));
        const refreshed = await exchange({
          grant_type: "refresh_token",
          client_id: clientId,
          refresh_token: initial.json.refresh_token,
        });
        assert.equal(refreshed.response.status, 200);
        assert.equal(decodeJwt(refreshed.json.access_token).workspace_id, workspaceId);
        const secondRefresh = await exchange({
          grant_type: "refresh_token",
          client_id: clientId,
          refresh_token: refreshed.json.refresh_token ?? initial.json.refresh_token,
        });
        assert.equal(secondRefresh.response.status, 200);
        const consents = await request("/oauth2/get-consents");
        const revoked = await request("/oauth2/delete-consent", { id: consents.json[0].id });
        assert.equal(revoked.response.status, 200);
        const rejected = await exchange({
          grant_type: "refresh_token",
          client_id: clientId,
          refresh_token:
            secondRefresh.json.refresh_token ??
            refreshed.json.refresh_token ??
            initial.json.refresh_token,
        });
        assert.ok(rejected.response.status >= 400);
        assert.equal(rejected.json.error, "invalid_grant");
        assert.match(rejected.json.error_description, /consent.*revoked/);
      });
    } finally {
      await conn.client.end();
    }
  },
  60000,
);
