import type { Auth } from "./auth";

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
    OPENAI_API_KEY?: string;
    TOOLKIT_API_KEY?: string;
    TOOLKIT_BASE_URL?: string;
    SMTP_HOST?: string;
    SMTP_PASSWORD?: string;
    SMTP_PORT?: string;
    SMTP_SECURE?: string;
    SMTP_USER?: string;
    IMAGE_READ_URL_TTL_SECONDS?: string;
    IMAGE_STORAGE_MODE?: "s3" | "binding";
    IMAGE_UPLOAD_MAX_BYTES?: string;
    IMAGE_UPLOAD_URL_TTL_SECONDS?: string;
    S3_ACCESS_KEY_ID?: string;
    S3_BUCKET_NAME?: string;
    S3_ENDPOINT?: string;
    S3_SECRET_ACCESS_KEY?: string;
  };
  Variables: {
    apiKey: ApiKeyContext | null;
    authMethod: "apiKey" | "session" | null;
    requestId: string;
    serverTimings: string[];
    user: Auth["$Infer"]["Session"]["user"] | null;
    session: AuthSession | null;
  };
};
