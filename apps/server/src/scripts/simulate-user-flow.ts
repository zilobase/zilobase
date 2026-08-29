import "dotenv/config";
import { desc, eq, like } from "drizzle-orm";
import { createAuth } from "../auth";
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

type FlowResponse<T = unknown> = {
  status: number;
  ok: boolean;
  headers: Headers;
  data: T;
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
    const values = getSetCookie?.call(headers) ?? splitSetCookie(headers.get("set-cookie"));

    for (const value of values) {
      const [cookie] = value.split(";");
      const separatorIndex = cookie.indexOf("=");

      if (separatorIndex === -1) {
        continue;
      }

      this.cookies.set(cookie.slice(0, separatorIndex), cookie.slice(separatorIndex + 1));
    }
  }
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

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      `${options.method ?? "GET"} ${path} failed (${response.status}): ${text}`,
    );
  }

  return {
    status: response.status,
    ok: response.ok,
    headers: response.headers,
    data,
  };
}

function getLocalAuthRequest(path: string, body: string | null | undefined) {
  const authPath = path.startsWith("/workspace/")
    ? path.replace("/workspace/", "/organization/")
    : path;

  if (!body) {
    return { body, path: authPath };
  }

  const parsed = JSON.parse(body) as unknown;

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

async function jsonRequest<T>(path: string, body: unknown, jar?: CookieJar) {
  return authRequest<T>(
    path,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    jar,
  );
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

async function getMagicLinkToken(email: string) {
  const [record] = await db
    .select({ identifier: verification.identifier })
    .from(verification)
    .where(like(verification.value, `%"email":"${email}"%`))
    .orderBy(desc(verification.createdAt))
    .limit(1);

  if (!record) {
    throw new Error(`No magic-link verification row found for ${email}`);
  }

  return record.identifier;
}

async function main() {
  await dbClient.client.connect();

  const stamp = Date.now();
  const email = `flow-${stamp}@zilobase.local`;
  const invitedEmail = `invite-${stamp}@zilobase.local`;
  const password = "zilobase-test-password";
  const signupJar = new CookieJar();
  const magicLinkJar = new CookieJar();

  console.info(`Creating test user ${email}`);
  const signup = await jsonRequest<{ user: { id: string; email: string } }>(
    "/sign-up/email",
    {
      name: "Zilobase Flow Tester",
      email,
      password,
      callbackURL: "/onboarding",
    },
    signupJar,
  );

  console.info(`User created: ${signup.data.user.id}`);

  await jsonRequest("/email-otp/send-verification-otp", {
    email,
    type: "email-verification",
  });

  const otp = await getEmailOtp(email);
  console.info(`Verifying OTP: ${otp}`);

  await jsonRequest(
    "/email-otp/verify-email",
    {
      email,
      otp,
    },
    signupJar,
  );

  const org = await jsonRequest<{
    id: string;
    name: string;
    slug: string;
  }>(
    "/workspace/create",
    {
      name: "Zilobase Flow Org",
      slug: `zilobase-flow-${stamp}`,
    },
    signupJar,
  );

  console.info(`Workspace created: ${org.data.id}`);

  const secondOrg = await jsonRequest<{
    id: string;
    name: string;
    slug: string;
  }>(
    "/workspace/create",
    {
      name: "Zilobase Flow Second Org",
      slug: `zilobase-flow-second-${stamp}`,
    },
    signupJar,
  );

  console.info(`Second workspace created: ${secondOrg.data.id}`);

  const workspaces = await authRequest<
    Array<{ id: string; name: string; slug: string }>
  >(
    "/workspace/list",
    {
      method: "GET",
    },
    signupJar,
  );

  if (workspaces.data.length < 2) {
    throw new Error(
      `Expected at least 2 workspaces, got ${workspaces.data.length}`,
    );
  }

  await jsonRequest(
    "/workspace/set-active",
    {
      workspaceId: secondOrg.data.id,
    },
    signupJar,
  );

  console.info(`Active workspace set: ${secondOrg.data.id}`);

  const team = await jsonRequest<{
    id: string;
    name: string;
    workspaceId: string;
  }>(
    "/workspace/create-team",
    {
      name: "Research",
      workspaceId: org.data.id,
    },
    signupJar,
  );

  console.info(`Team created: ${team.data.id}`);

  const invite = await jsonRequest<{ id: string; email: string }>(
    "/workspace/invite-member",
    {
      email: invitedEmail,
      role: "member",
      workspaceId: org.data.id,
      teamId: team.data.id,
    },
    signupJar,
  );

  console.info(`Invitation created: ${invite.data.id} for ${invite.data.email}`);

  await jsonRequest("/sign-in/magic-link", {
    email,
    callbackURL: "/",
  });

  const magicToken = await getMagicLinkToken(email);
  console.info(`Verifying magic-link token: ${magicToken}`);

  const magicSession = await authRequest<{
    user: { id: string; email: string };
    session: { id: string };
  }>(`/magic-link/verify?token=${encodeURIComponent(magicToken)}`, {}, magicLinkJar);

  console.info(`Magic-link session created: ${magicSession.data.session.id}`);
  console.info("Flow simulation completed successfully.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await dbClient.client.end();
  });
