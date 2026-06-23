import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;
const srcDir = fileURLToPath(new URL("./src", import.meta.url));
const editorDir = fileURLToPath(new URL("./src/editor", import.meta.url));
const connectorsDir = fileURLToPath(
  new URL("../../packages/connectors/src/connectors", import.meta.url),
);
const featuresDir = fileURLToPath(
  new URL("../../packages/features/src", import.meta.url),
);
const workspaceContextDir = fileURLToPath(
  new URL("../../packages/workspace-context/src", import.meta.url),
);
const backendTarget = process.env.VITE_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:3000";

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      { find: "@/packages/editor", replacement: editorDir },
      { find: "@", replacement: srcDir },
      {
        find: /^@notelab\/features\/(.+)$/,
        replacement: `${featuresDir}/$1/index.ts`,
      },
      { find: /^@notelab\/features$/, replacement: `${featuresDir}/index.ts` },
      {
        find: "@notelab/workspace-context",
        replacement: `${workspaceContextDir}/index.ts`,
      },
      {
        find: "@notelab/gmail-connector/ui",
        replacement: `${connectorsDir}/gmail/src/ui.tsx`,
      },
      {
        find: "@notelab/github-connector/ui",
        replacement: `${connectorsDir}/github/src/ui.tsx`,
      },
      {
        find: "@notelab/google-calendar-connector/ui",
        replacement: `${connectorsDir}/google-calendar/src/ui.tsx`,
      },
      {
        find: "@notelab/google-drive-connector/ui",
        replacement: `${connectorsDir}/google-drive/src/ui.tsx`,
      },
      {
        find: "@notelab/linear-connector/ui",
        replacement: `${connectorsDir}/linear/src/ui.tsx`,
      },
      {
        find: "@notelab/slack-connector/ui",
        replacement: `${connectorsDir}/slack/src/ui.tsx`,
      },
    ],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || process.env.VITE_DEV_HOST || "0.0.0.0",
    proxy: {
      "/api": {
        target: backendTarget,
        changeOrigin: true,
      },
      "/agents": {
        target: backendTarget,
        changeOrigin: true,
        ws: true,
      },
      "/session": {
        target: backendTarget,
        changeOrigin: true,
      },
      "/sign-in": {
        target: backendTarget,
        changeOrigin: true,
      },
      "/sign-up": {
        target: backendTarget,
        changeOrigin: true,
      },
      "/sign-out": {
        target: backendTarget,
        changeOrigin: true,
      },
      "/email-otp": {
        target: backendTarget,
        changeOrigin: true,
      },
      "/organization": {
        target: backendTarget,
        changeOrigin: true,
      },
      "/search": {
        target: backendTarget,
        changeOrigin: true,
      },
      "/workspaces": {
        target: backendTarget,
        changeOrigin: true,
        ws: true,
      },
      "/databases": {
        target: backendTarget,
        changeOrigin: true,
        ws: true,
      },
      "/images": {
        target: backendTarget,
        changeOrigin: true,
      },
      "/user-settings": {
        target: backendTarget,
        changeOrigin: true,
      },
    },
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching the desktop shell
      ignored: ["**/src-tauri/**", "../desktop/src-tauri/**"],
    },
  },
}));
