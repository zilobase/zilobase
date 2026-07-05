/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FEATURE_NOTION_IMPORT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
