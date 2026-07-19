import { apiKey } from "@better-auth/api-key";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  emailOTP,
  magicLink,
  organization as organizationPlugin,
} from "better-auth/plugins";
import { API_KEY_PREFIX } from "./api-keys";
import { getEEPlugins } from "./edition";
import { db, type Database } from "./db";
import * as schema from "./db/schema";
import { sendEmail } from "./email";
import {
  getPrimaryClientOrigin,
  getRequiredStringEnv,
  getTrustedOrigins,
  isLocalDevelopmentHost,
} from "./config";

type AuthEnv = Record<string, unknown>;

export function createAuth(
  env: AuthEnv,
  request: Request,
  database: Database = db,
): Auth {
  return createAuthInstance(env, request, database);
}

function createAuthInstance(env: AuthEnv, request: Request, database: Database) {
  const requestUrl = new URL(request.url);

  return betterAuth({
    baseURL: getBaseURL(env, requestUrl),
    secret: getRequiredStringEnv(env, "BETTER_AUTH_SECRET"),
    trustedOrigins: getTrustedOrigins(env, requestUrl.origin),
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    ...sharedAuthOptions(env),
  });
}

function sharedAuthOptions(env: AuthEnv) {
  return {
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
    },
    emailVerification: {
      autoSignInAfterVerification: true,
    },
    plugins: [
      // Enterprise-edition plugins (SSO, ...). Empty in the Community build; each
      // EE plugin self-gates on the active license tier. See ./edition.ts.
      ...(getEEPlugins() as never[]),
      apiKey({
        defaultPrefix: API_KEY_PREFIX,
        enableMetadata: true,
        keyExpiration: {
          defaultExpiresIn: null,
          maxExpiresIn: 3650,
          minExpiresIn: 1,
        },
        maximumNameLength: 80,
        rateLimit: {
          enabled: true,
          maxRequests: 1000,
          timeWindow: 60 * 60 * 1000,
        },
        requireName: true,
      }),
      expo(),
      emailOTP({
        async sendVerificationOTP({ email, otp, type }) {
          await sendEmail(env, {
            to: email,
            subject: `Your Zilobase ${type} code`,
            text: `Use this one-time code for ${type}: ${otp}`,
          });
        },
      }),
      magicLink({
        async sendMagicLink({ email, url }) {
          await sendEmail(env, {
            to: email,
            subject: "Your Zilobase magic link",
            text: `Open this link to sign in to Zilobase:\n\n${url}`,
          });
        },
      }),
      organizationPlugin({
        schema: {
          session: {
            fields: {
              activeOrganizationId: "activeWorkspaceId",
            },
          },
          organization: {
            modelName: "workspace",
          },
        },
        teams: {
          enabled: true,
        },
        async sendInvitationEmail(data) {
          const inviteLink = `${getPrimaryClientOrigin(env)}/accept-invitation?id=${data.id}`;

          await sendEmail(env, {
            to: data.email,
            subject: `Invitation to join ${data.organization.name} on Zilobase`,
            text: [
              `${data.inviter.user.name} (${data.inviter.user.email}) invited you to ${data.organization.name}.`,
              "",
              `Accept the invitation: ${inviteLink}`,
            ].join("\n"),
          });
        },
      }),
    ],
  };
}

function getBaseURL(env: AuthEnv, requestUrl: URL) {
  const configuredUrl = getRequiredStringEnv(env, "BETTER_AUTH_URL");
  const parsedConfiguredUrl = new URL(configuredUrl);

  if (
    isLocalDevelopmentHost(parsedConfiguredUrl.hostname) &&
    isLocalDevelopmentHost(requestUrl.hostname)
  ) {
    return requestUrl.origin;
  }

  return configuredUrl;
}

export type Auth = ReturnType<typeof createAuthInstance>;
