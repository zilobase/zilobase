import type { Auth } from "./auth";
import type { ZilobaseEditionExtension } from "./edition-extension";

type AuthSession = Auth["$Infer"]["Session"]["session"] & {
  activeWorkspaceId?: string | null;
  activeTeamId?: string | null;
};

type ApiKeyContext = {
  id: string;
  workspaceId: string;
  referenceId: string;
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
    authMethod: "apiKey" | "session" | null;
    requestId: string;
    editionExtension: ZilobaseEditionExtension | null;
    serverTimings: string[];
    user: Auth["$Infer"]["Session"]["user"] | null;
    session: AuthSession | null;
  };
};
