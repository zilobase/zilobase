import { config as loadEnv } from "@dotenvx/dotenvx";
import { desc, eq } from "drizzle-orm";

loadEnv({
  path: process.env.ZILOBASE_ENV_FILE ?? "../../.env.development",
  quiet: true,
  ignore: ["MISSING_ENV_FILE"],
  noOps: true,
});

import { createApp } from "../app";
import { createAuth } from "../features/auth";
import { createDbClientForUrl, runWithDb } from "../infrastructure/database";
import { verification } from "../infrastructure/database/schema";

const apiBase = getRequiredEnv("BETTER_AUTH_URL");
const clientUrl = getRequiredEnv("CLIENT_URL");
const clientOrigin = clientUrl.split(",")[0]?.trim() ?? clientUrl;
const databaseUrl = getRequiredEnv("DATABASE_URL");
const authEnv = {
  BETTER_AUTH_SECRET: getRequiredEnv("BETTER_AUTH_SECRET"),
  BETTER_AUTH_URL: apiBase,
  CLIENT_URL: clientUrl,
};
const dbClient = createDbClientForUrl(databaseUrl);
const db = dbClient.db;
const app = createApp();

type FlowResponse<T = unknown> = {
  data: T;
  headers: Headers;
  ok: boolean;
  status: number;
};

class CookieJar {
  private cookies = new Map<string, string>();

  header() {
    return [...this.cookies.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  store(headers: Headers) {
    const getSetCookie = (headers as Headers & {
      getSetCookie?: () => string[];
    }).getSetCookie;
    const values =
      getSetCookie?.call(headers) ?? splitSetCookie(headers.get("set-cookie"));

    for (const value of values) {
      const [cookie] = value.split(";");
      const separatorIndex = cookie.indexOf("=");

      if (separatorIndex === -1) {
        continue;
      }

      this.cookies.set(
        cookie.slice(0, separatorIndex),
        cookie.slice(separatorIndex + 1),
      );
    }
  }
}

async function main() {
  await dbClient.client.connect();

  const stamp = Date.now();
  const email = `api-key-flow-${stamp}@zilobase.local`;
  const password = "zilobase-test-password";
  const jar = new CookieJar();

  console.info(`Creating test user ${email}`);
  const signup = await authJsonRequest<{ user: { id: string; email: string } }>(
    "/sign-up/email",
    {
      name: "Zilobase API Key Tester",
      email,
      password,
      callbackURL: "/onboarding",
    },
    jar,
  );

  await authJsonRequest("/email-otp/send-verification-otp", {
    email,
    type: "email-verification",
  });

  const otp = await getEmailOtp(email);
  await authJsonRequest(
    "/email-otp/verify-email",
    {
      email,
      otp,
    },
    jar,
  );

  const workspace = await authJsonRequest<{
    id: string;
    name: string;
    slug: string;
  }>(
    "/workspace/create",
    {
      name: "API Key Flow Org",
      slug: `api-key-flow-${stamp}`,
    },
    jar,
  );
  const otherWorkspace = await authJsonRequest<{
    id: string;
    name: string;
    slug: string;
  }>(
    "/workspace/create",
    {
      name: "API Key Flow Other Org",
      slug: `api-key-flow-other-${stamp}`,
    },
    jar,
  );

  console.info(`Created user ${signup.data.user.id}`);
  console.info(`Created workspace ${workspace.data.id}`);
  console.info(`Created second workspace ${otherWorkspace.data.id}`);

  const createdKey = await appJsonRequest<{
    key: { id: string; key: string; workspaceId: string };
  }>(
    "/api/keys",
    {
      name: "API key flow test",
      workspaceId: workspace.data.id,
      expiresIn: 60 * 60 * 24,
    },
    { expectedStatus: 201, jar, method: "POST" },
  );

  if (!createdKey.data.key.key.startsWith("nl_")) {
    throw new Error("Created API key did not use the nl_ prefix.");
  }

  console.info(`Created API key ${createdKey.data.key.id}`);

  const createPage = await appJsonRequest<{
    page: { id: string; workspaceId: string };
  }>(
    "/pages",
    {
      workspaceId: workspace.data.id,
      name: "API-created page",
      type: "pageblock",
      url: "#",
      content: null,
    },
    {
      bearerToken: createdKey.data.key.key,
      expectedStatus: 201,
      method: "POST",
    },
  );

  if (createPage.data.page.workspaceId !== workspace.data.id) {
    throw new Error("API key created a page in the wrong workspace.");
  }

  console.info(`Created page ${createPage.data.page.id}`);

  await appRequest(
    `/pages?workspaceId=${encodeURIComponent(workspace.data.id)}`,
    {
      bearerToken: createdKey.data.key.key,
      expectedStatus: 200,
    },
  );
  console.info("API key can read its pinned workspace.");

  await appRequest(
    `/pages?workspaceId=${encodeURIComponent(otherWorkspace.data.id)}`,
    {
      bearerToken: createdKey.data.key.key,
      expectedStatus: 403,
    },
  );
  console.info("API key is rejected for a different workspace.");

  await appRequest(
    `/workspaces/${encodeURIComponent(otherWorkspace.data.id)}/access-targets`,
    {
      bearerToken: createdKey.data.key.key,
      expectedStatus: 403,
    },
  );
  console.info("API key is rejected for mismatched workspace params.");

  await appRequest(`/api/keys/${encodeURIComponent(createdKey.data.key.id)}`, {
    expectedStatus: 200,
    jar,
    method: "DELETE",
  });
  console.info("API key revoked.");

  await appRequest(
    `/pages?workspaceId=${encodeURIComponent(workspace.data.id)}`,
    {
      bearerToken: createdKey.data.key.key,
      expectedStatus: 401,
    },
  );
  console.info("Revoked API key is rejected.");

  console.info("API key flow test completed successfully.");
}

async function authJsonRequest<T>(
  path: string,
  body: unknown,
  jar?: CookieJar,
): Promise<FlowResponse<T>> {
  return authRequest<T>(
    path,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    jar,
  );
}

async function authRequest<T>(
  path: string,
  options: RequestInit & { body?: string | null } = {},
  jar?: CookieJar,
): Promise<FlowResponse<T>> {
  const headers = new Headers(options.headers);

  headers.set("origin", clientOrigin);

  if (options.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const cookie = jar?.header();

  if (cookie) {
    headers.set("cookie", cookie);
  }

  const { body, path: authPath } = getLocalAuthRequest(path, options.body);
  const request = new Request(`${apiBase}/api/auth${authPath}`, {
    ...options,
    body,
    headers,
  });
  const response = await runWithDb(db, () =>
    createAuth(authEnv, request, db).handler(request),
  );

  jar?.store(response.headers);

  const result = await parseResponse<T>(response);

  if (!response.ok) {
    throw new Error(
      `${options.method ?? "GET"} ${path} failed (${response.status}): ${JSON.stringify(result.data)}`,
    );
  }

  return result;
}

function getLocalAuthRequest(path: string, body: string | null | undefined) {
  const authPath = path.startsWith("/workspace/")
    ? path.replace("/workspace/", "/organization/")
    : path;

  if (!body) {
    return { body, path: authPath };
  }

  const parsed = parseJson(body);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { body, path: authPath };
  }

  const nextBody = { ...parsed } as Record<string, unknown>;

  if (
    typeof nextBody.workspaceId === "string" &&
    typeof nextBody.organizationId !== "string"
  ) {
    nextBody.organizationId = nextBody.workspaceId;
    delete nextBody.workspaceId;
  }

  return { body: JSON.stringify(nextBody), path: authPath };
}

async function appJsonRequest<T>(
  path: string,
  body: unknown,
  options: AppRequestOptions = {},
) {
  return appRequest<T>(path, {
    ...options,
    body: JSON.stringify(body),
    expectedStatus: options.expectedStatus ?? 200,
    method: options.method ?? "POST",
  });
}

type AppRequestOptions = {
  bearerToken?: string;
  body?: string;
  expectedStatus?: number;
  jar?: CookieJar;
  method?: string;
};

async function appRequest<T = unknown>(
  path: string,
  options: AppRequestOptions = {},
): Promise<FlowResponse<T>> {
  const headers = new Headers();

  headers.set("origin", clientOrigin);

  if (options.body) {
    headers.set("content-type", "application/json");
  }

  if (options.bearerToken) {
    headers.set("authorization", `Bearer ${options.bearerToken}`);
  }

  const cookie = options.jar?.header();

  if (cookie) {
    headers.set("cookie", cookie);
  }

  const request = new Request(`${apiBase}${path}`, {
    body: options.body,
    headers,
    method: options.method ?? "GET",
  });
  const response = await app.fetch(request, authEnv);

  options.jar?.store(response.headers);

  const result = await parseResponse<T>(response);
  const expectedStatus = options.expectedStatus ?? 200;

  if (result.status !== expectedStatus) {
    throw new Error(
      `${options.method ?? "GET"} ${path} expected ${expectedStatus}, got ${result.status}: ${JSON.stringify(result.data)}`,
    );
  }

  return result;
}

async function parseResponse<T>(response: Response): Promise<FlowResponse<T>> {
  const text = await response.text();
  const data = text ? (parseJson(text) as T) : (null as T);

  return {
    data,
    headers: response.headers,
    ok: response.ok,
    status: response.status,
  };
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

async function getEmailOtp(email: string) {
  const identifier = `email-verification-otp-${email}`;
  const [record] = await db
    .select({ value: verification.value })
    .from(verification)
    .where(eq(verification.identifier, identifier))
    .orderBy(desc(verification.createdAt))
    .limit(1);

  if (!record) {
    throw new Error(`No OTP verification row found for ${email}`);
  }

  return record.value.slice(0, record.value.lastIndexOf(":"));
}

function splitSetCookie(value: string | null) {
  if (!value) {
    return [];
  }

  return value.split(/,(?=\s*[^;,]+=)/g).map((cookie) => cookie.trim());
}

function getRequiredEnv(key: string) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await dbClient.client.end();
  });
