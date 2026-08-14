import { apiKey } from "@better-auth/api-key";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  bearer,
  emailOTP,
  magicLink,
  organization as organizationPlugin,
} from "better-auth/plugins";
import { API_KEY_PREFIX } from "./api-keys";
import { db, type Database } from "./db";
import * as schema from "./db/schema";
import { sendEmail } from "./email";
import {
  getPrimaryClientOrigin,
  getRequiredStringEnv,
  getStringEnv,
  getTrustedOrigins,
  isLocalDevelopmentHost,
} from "./config";
import {
  evaluateSelfHostedRegistration,
  readInvitationIdFromCookieHeader,
} from "./features/instance/registration";
import { isSelfHostedRuntime } from "./runtime-adapter";

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
    ...sharedAuthOptions(env, request),
  });
}

function sharedAuthOptions(env: AuthEnv, request: Request) {
  const googleClientId = getStringEnv(env, "GOOGLE_CLIENT_ID");
  const googleClientSecret = getStringEnv(env, "GOOGLE_CLIENT_SECRET");
  const isHosted = getPrimaryClientOrigin(env) === "https://app.zilobase.com";

  return {
    advanced: isHosted
      ? {
          crossSubDomainCookies: {
            domain: ".zilobase.com",
            enabled: true,
          },
        }
      : undefined,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
    },
    emailVerification: {
      autoSignInAfterVerification: true,
    },
    databaseHooks: {
      user: {
        create: {
          async before(
            candidate: { email: string },
            context: { body?: unknown; request?: Request } | null,
          ) {
            if (!isSelfHostedRuntime()) {
              return;
            }

            const body =
              context?.body && typeof context.body === "object"
                ? (context.body as Record<string, unknown>)
                : null;
            const invitationId =
              typeof body?.invitationId === "string"
                ? body.invitationId
                : readInvitationIdFromCookieHeader(
                    context?.request?.headers.get("cookie") ??
                      request.headers.get("cookie"),
                  );
            const decision = await evaluateSelfHostedRegistration(env, {
              email: candidate.email,
              invitationId,
            });

            if (!decision.allowed) {
              throw new APIError("FORBIDDEN", {
                code: decision.code.toUpperCase(),
                message: decision.message,
              });
            }
          },
        },
      },
    },
    socialProviders:
      googleClientId && googleClientSecret
        ? {
            google: {
              clientId: googleClientId,
              clientSecret: googleClientSecret,
            },
          }
        : {},
    plugins: [
      bearer(),
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
