/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FEATURE_DATABASE_REALTIME?: string
  readonly VITE_FEATURE_MAIL?: string
  readonly VITE_FEATURE_NOTION_IMPORT?: string
  readonly VITE_FEATURE_TEAMSPACES?: string
  readonly VITE_POSTHOG_KEY?: string
  readonly VITE_POSTHOG_HOST?: string
  readonly VITE_POSTHOG_UI_HOST?: string
  readonly VITE_POSTHOG_SESSION_REPLAY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
