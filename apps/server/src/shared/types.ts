import type { BetterAuthPlugin } from "better-auth";
import type { Hono } from "hono";

import type { Auth } from "../features/auth";
// The public edition contract exposes the canonical Drizzle database type.
import type { Database } from "../infrastructure/database";

type AuthSession = Auth["$Infer"]["Session"]["session"] & {
  activeWorkspaceId?: string | null;
  activeTeamId?: string | null;
};

type ApiKeyContext = {
  id: string;
  workspaceId: string;
  referenceId: string;
};

const MEMBERSHIP_GRANT_SOURCES = [
  "bootstrap",
  "open-registration",
  "invitation",
  "admin",
  "sso-jit",
  "scim",
] as const;

export type MembershipGrantSource =
  (typeof MEMBERSHIP_GRANT_SOURCES)[number];

export type MembershipGrantInput = {
  database: Database;
  role: string;
  source: MembershipGrantSource;
  userId: string;
  workspaceId: string;
};

export type SecurityEvent = {
  actorUserId?: string | null;
  database: Database;
  details?: Record<string, boolean | number | string | null>;
  occurredAt: Date;
  type: string;
  userId?: string | null;
  workspaceId?: string | null;
};

export type ZilobaseEditionExtension = {
  readonly id: "enterprise";
  readonly capabilities: readonly string[];
  readonly authPlugins: readonly BetterAuthPlugin[];
  registerRoutes(app: Hono<AppBindings>): void;
  beforeMembershipGrant(input: MembershipGrantInput): Promise<void>;
  recordSecurityEvent(event: SecurityEvent): Promise<void>;
};

export type EditionExtensionOptions = {
  editionExtension?: ZilobaseEditionExtension;
};

export type AppBindings = {
  Bindings: {
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL: string;
    CLIENT_URL: string;
    COLLABORATION_SECRET?: string;
    COLLABORATION_WEBSOCKET_URL?: string;
    DATABASE_REALTIME_WEBSOCKET_URL?: string;
    DATABASE_URL?: string;
    EMAIL_FROM?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    GMAIL_GOOGLE_CLIENT_ID?: string;
    GMAIL_GOOGLE_CLIENT_SECRET?: string;
    GMAIL_TOKEN_ENCRYPTION_KEY?: string;
    GMAIL_PUBSUB_TOPIC?: string;
    GMAIL_PUBSUB_PUSH_AUDIENCE?: string;
    GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL?: string;
    GMAIL_PUBSUB_SUBSCRIPTION?: string;
    MAIL_ENABLED?: string;
    AI_AGENT_AUDIT_RETENTION_DAYS?: string;
    AI_AGENT_CLEANUP_BATCH_SIZE?: string;
    AI_AGENT_DAILY_USAGE_LIMITS_ENABLED?: string;
    AI_AGENT_MAX_ARTIFACT_BYTES_PER_USER_PER_DAY?: string;
    AI_AGENT_MAX_ARTIFACTS_PER_USER_PER_DAY?: string;
    AI_AGENT_MAX_CONCURRENT_TURNS_PER_USER?: string;
    AI_AGENT_MAX_CONCURRENT_TURNS_PER_WORKSPACE?: string;
    AI_AGENT_MAX_FILES_PER_TURN?: string;
    AI_AGENT_MAX_INPUT_CHARACTERS?: string;
    AI_AGENT_MAX_INPUT_MESSAGES?: string;
    AI_AGENT_MAX_OUTPUT_TOKENS?: string;
    AI_AGENT_MAX_PROVIDER_RETRIES?: string;
    AI_AGENT_MAX_STEPS?: string;
    AI_AGENT_MAX_TOKENS_PER_USER_PER_DAY?: string;
    AI_AGENT_MAX_TURNS_PER_USER_PER_DAY?: string;
    AI_AGENT_MAX_UPLOAD_BYTES_PER_USER_PER_DAY?: string;
    AI_AGENT_STREAM_CHUNK_TIMEOUT_MS?: string;
    AI_AGENT_STREAM_STEP_TIMEOUT_MS?: string;
    AI_AGENT_TURN_TIMEOUT_MS?: string;
    AI_LEGACY_CHAT_ENABLED?: string;
    AI_PROVIDER_ALLOWED_BASE_URLS?: string;
    AI_PROVIDER_CREDENTIAL_ENCRYPTION_KEY?: string;
    OPENAI_API_KEY?: string;
    SMTP_HOST?: string;
    SMTP_PASSWORD?: string;
    SMTP_PORT?: string;
    SMTP_SECURE?: string;
    SMTP_USER?: string;
    IMAGE_READ_URL_TTL_SECONDS?: string;
    IMAGE_STORAGE_MODE?: "s3" | "binding";
    IMAGE_UPLOAD_MAX_BYTES?: string;
    IMAGE_UPLOAD_URL_TTL_SECONDS?: string;
    MEETING_BLOCK_ENABLED?: string;
    MEETING_AUDIO_WEBSOCKET_URL?: string;
    MEETING_COLLABORATION_WEBSOCKET_URL?: string;
    OPENAI_REALTIME_TRANSCRIPTION_MODEL?: string;
    REALTIME_REDIS_URL?: string;
    ZILOBASE_DEMO_ENABLED?: string;
    ZILOBASE_INSTANCE_NAME?: string;
    ZILOBASE_BOOTSTRAP_TOKEN?: string;
    ZILOBASE_MINIMUM_DESKTOP_VERSION?: string;
    S3_ACCESS_KEY_ID?: string;
    S3_BUCKET_NAME?: string;
    S3_ENDPOINT?: string;
    S3_PUBLIC_ENDPOINT?: string;
    S3_SECRET_ACCESS_KEY?: string;
  };
  Variables: {
    apiKey: ApiKeyContext | null;
    authMethod: "apiKey" | "demo" | "session" | null;
    requestId: string;
    editionExtension: ZilobaseEditionExtension | null;
    serverTimings: string[];
    user: Auth["$Infer"]["Session"]["user"] | null;
    session: AuthSession | null;
  };
};
