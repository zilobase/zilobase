import "dotenv/config";
import { desc, eq, like } from "drizzle-orm";
import { auth } from "../auth";
import { db, pool } from "../db";
import { verification } from "../db/schema";

const apiBase = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const clientUrl = process.env.CLIENT_URL ?? "http://localhost:1420";

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

async function authRequest<T>(
  path: string,
  options: RequestInit & { body?: string | null } = {},
  jar?: CookieJar,
): Promise<FlowResponse<T>> {
  const headers = new Headers(options.headers);

  headers.set("origin", clientUrl);

  if (options.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const cookie = jar?.header();

  if (cookie) {
    headers.set("cookie", cookie);
  }

  const request = new Request(`${apiBase}/api/auth${path}`, {
    ...options,
    headers,
  });
  const response = await auth.handler(request);

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
  const stamp = Date.now();
  const email = `flow-${stamp}@notelab.local`;
  const invitedEmail = `invite-${stamp}@notelab.local`;
  const password = "notelab-test-password";
  const signupJar = new CookieJar();
  const magicLinkJar = new CookieJar();

  console.info(`Creating test user ${email}`);
  const signup = await jsonRequest<{ user: { id: string; email: string } }>(
    "/sign-up/email",
    {
      name: "Notelab Flow Tester",
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
    "/organization/create",
    {
      name: "Notelab Flow Org",
      slug: `notelab-flow-${stamp}`,
    },
    signupJar,
  );

  console.info(`Organization created: ${org.data.id}`);

  const secondOrg = await jsonRequest<{
    id: string;
    name: string;
    slug: string;
  }>(
    "/organization/create",
    {
      name: "Notelab Flow Second Org",
      slug: `notelab-flow-second-${stamp}`,
    },
    signupJar,
  );

  console.info(`Second organization created: ${secondOrg.data.id}`);

  const organizations = await authRequest<
    Array<{ id: string; name: string; slug: string }>
  >(
    "/organization/list",
    {
      method: "GET",
    },
    signupJar,
  );

  if (organizations.data.length < 2) {
    throw new Error(
      `Expected at least 2 organizations, got ${organizations.data.length}`,
    );
  }

  await jsonRequest(
    "/organization/set-active",
    {
      organizationId: secondOrg.data.id,
    },
    signupJar,
  );

  console.info(`Active organization set: ${secondOrg.data.id}`);

  const team = await jsonRequest<{
    id: string;
    name: string;
    organizationId: string;
  }>(
    "/organization/create-team",
    {
      name: "Research",
      organizationId: org.data.id,
    },
    signupJar,
  );

  console.info(`Team created: ${team.data.id}`);

  const invite = await jsonRequest<{ id: string; email: string }>(
    "/organization/invite-member",
    {
      email: invitedEmail,
      role: "member",
      organizationId: org.data.id,
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
    await pool.end();
  });
