/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FEATURE_DATABASE_REALTIME?: string
  readonly VITE_FEATURE_MAIL?: string
  readonly VITE_FEATURE_NOTION_IMPORT?: string
  readonly VITE_FEATURE_TEAMSPACES?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
