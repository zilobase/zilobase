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
    DATABASE_URL?: string;
    EMAIL_FROM?: string;
    OPENAI_API_KEY?: string;
    RESEND_API_KEY?: string;
    IMAGE_READ_URL_TTL_SECONDS?: string;
    IMAGE_STORAGE_MODE?: "s3" | "binding";
    IMAGE_UPLOAD_MAX_BYTES?: string;
    IMAGE_UPLOAD_URL_TTL_SECONDS?: string;
    OAUTH_STATE_SECRET: string;
    R2_ACCESS_KEY_ID?: string;
    R2_ACCOUNT_ID?: string;
    R2_BUCKET_NAME?: string;
    R2_ENDPOINT?: string;
    R2_SECRET_ACCESS_KEY?: string;
    GOOGLE_OAUTH_CLIENT_ID?: string;
    GOOGLE_OAUTH_CLIENT_SECRET?: string;
    GITHUB_OAUTH_CLIENT_ID?: string;
    GITHUB_OAUTH_CLIENT_SECRET?: string;
    SLACK_OAUTH_CLIENT_ID?: string;
    SLACK_OAUTH_CLIENT_SECRET?: string;
    LINEAR_OAUTH_CLIENT_ID?: string;
    LINEAR_OAUTH_CLIENT_SECRET?: string;
  };
  Variables: {
    apiKey: ApiKeyContext | null;
    authMethod: "apiKey" | "session" | null;
    user: Auth["$Infer"]["Session"]["user"] | null;
    session: AuthSession | null;
  };
};
