import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": "/src",
      "@notelab/gmail-connector/ui": "/src/connectors/gmail/src/ui.tsx",
      "@notelab/github-connector/ui": "/src/connectors/github/src/ui.tsx",
      "@notelab/google-calendar-connector/ui":
        "/src/connectors/google-calendar/src/ui.tsx",
      "@notelab/google-drive-connector/ui":
        "/src/connectors/google-drive/src/ui.tsx",
      "@notelab/linear-connector/ui": "/src/connectors/linear/src/ui.tsx",
      "@notelab/slack-connector/ui": "/src/connectors/slack/src/ui.tsx",
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
