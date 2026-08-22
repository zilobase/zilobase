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
import { memberAc } from "better-auth/plugins/organization/access";
import { eq } from "drizzle-orm";
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
  resolvePublicRequestUrl,
} from "./config";
import {
  evaluateSelfHostedRegistration,
  readInvitationIdFromCookieHeader,
} from "./features/instance/registration";
import { isSelfHostedRuntime } from "./runtime-adapter";
import type { EditionExtensionOptions } from "./edition-extension";
import {
  parseMembershipAccessExpiry,
  TemporaryMembershipValidationError,
} from "./services/temporary-membership";

type AuthEnv = Record<string, unknown>;

export function createAuth(
  env: AuthEnv,
  request: Request,
  database: Database = db,
  options: EditionExtensionOptions = {},
): Auth {
  return createAuthInstance(env, request, database, options);
}

function createAuthInstance(
  env: AuthEnv,
  request: Request,
  database: Database,
  options: EditionExtensionOptions,
) {
  const requestUrl = resolvePublicRequestUrl(request, env);

  return betterAuth({
    baseURL: getBaseURL(env, requestUrl),
    secret: getRequiredStringEnv(env, "BETTER_AUTH_SECRET"),
    trustedOrigins: getTrustedOrigins(env, requestUrl.origin),
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    ...sharedAuthOptions(env, request, database, options),
  });
}

function sharedAuthOptions(
  env: AuthEnv,
  request: Request,
  database: Database,
  options: EditionExtensionOptions,
) {
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
        roles: {
          temporary: memberAc,
        },
        schema: {
          session: {
            fields: {
              activeOrganizationId: "activeWorkspaceId",
            },
          },
          organization: {
            modelName: "workspace",
          },
          member: {
            additionalFields: {
              accessExpiresAt: {
                fieldName: "access_expires_at",
                input: false,
                required: false,
                type: "date",
              },
            },
          },
          invitation: {
            additionalFields: {
              membershipExpiresAt: {
                fieldName: "membership_expires_at",
                input: false,
                required: false,
                type: "date",
              },
            },
          },
        },
        teams: {
          enabled: true,
        },
        organizationHooks: {
          async beforeCreateInvitation({ invitation }) {
            if (invitation.role === "temporary") {
              throw new APIError("BAD_REQUEST", {
                code: "TEMPORARY_INVITATION_ENDPOINT_REQUIRED",
                message:
                  "Temporary invitations must include an expiration date.",
              });
            }
          },
          async beforeAcceptInvitation({ invitation, user }) {
            try {
              parseMembershipAccessExpiry(
                invitation.role as "owner" | "admin" | "member" | "temporary",
                invitation.membershipExpiresAt,
              );
            } catch (error) {
              if (error instanceof TemporaryMembershipValidationError) {
                throw new APIError("BAD_REQUEST", {
                  code: "INVALID_TEMPORARY_MEMBERSHIP_EXPIRATION",
                  message: error.message,
                });
              }

              throw error;
            }

            await options.editionExtension?.beforeMembershipGrant({
              database,
              role: invitation.role,
              source: "invitation",
              userId: user.id,
              workspaceId: invitation.organizationId,
            });
          },
          async beforeAddMember({ member: candidate }) {
            if (candidate.role === "temporary") {
              throw new APIError("BAD_REQUEST", {
                code: "TEMPORARY_MEMBERSHIP_EXPIRATION_REQUIRED",
                message:
                  "Temporary memberships must include an expiration date.",
              });
            }

            await options.editionExtension?.beforeMembershipGrant({
              database,
              role: candidate.role,
              source: "admin",
              userId: candidate.userId,
              workspaceId: candidate.organizationId,
            });
          },
          async beforeUpdateMemberRole({ member: existing, newRole }) {
            if (existing.role === "temporary" || newRole === "temporary") {
              throw new APIError("BAD_REQUEST", {
                code: "TEMPORARY_MEMBERSHIP_ENDPOINT_REQUIRED",
                message:
                  "Use the workspace member endpoint to change temporary access.",
              });
            }
          },
          async afterAcceptInvitation({ invitation, member: created }) {
            const accessExpiresAt = parseMembershipAccessExpiry(
              created.role as "owner" | "admin" | "member" | "temporary",
              invitation.membershipExpiresAt,
            );

            await database
              .update(schema.member)
              .set({ accessExpiresAt })
              .where(eq(schema.member.id, created.id));

            await options.editionExtension?.recordSecurityEvent({
              database,
              details: {
                accessExpiresAt: accessExpiresAt?.toISOString() ?? null,
                role: created.role,
                source: "invitation",
              },
              occurredAt: new Date(),
              type: "membership.granted",
              userId: created.userId,
              workspaceId: invitation.organizationId,
            });
          },
          async afterAddMember({ member: created }) {
            await options.editionExtension?.recordSecurityEvent({
              database,
              details: { role: created.role, source: "admin" },
              occurredAt: new Date(),
              type: "membership.granted",
              userId: created.userId,
              workspaceId: created.organizationId,
            });
          },
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
      ...(options.editionExtension?.authPlugins ?? []),
    ],
  };
}

function getBaseURL(env: AuthEnv, requestUrl: URL) {
  if (isLocalDevelopmentHost(requestUrl.hostname)) {
    return requestUrl.origin;
  }

  return getRequiredStringEnv(env, "BETTER_AUTH_URL");
}

export type Auth = ReturnType<typeof createAuthInstance>;
