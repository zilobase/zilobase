import { dirname, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, searchForWorkspaceRoot, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { aiDevTracePlugin } from "./vite/ai-dev-trace-plugin.ts";

const host = process.env.TAURI_DEV_HOST;
const srcDir = fileURLToPath(new URL("./src", import.meta.url));
const editorDir = fileURLToPath(new URL("./src/features/editor", import.meta.url));
const featuresDir = fileURLToPath(
  new URL("../../packages/features/src", import.meta.url),
);
const pageContextDir = fileURLToPath(
  new URL("../../packages/page-context/src", import.meta.url),
);
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const externalAiConversationModule =
  process.env.ZILOBASE_WEB_AI_CONVERSATION_MODULE?.trim();
const aiConversationModule = externalAiConversationModule
  ? resolve(externalAiConversationModule)
  : `${srcDir}/features/ai/conversation/use-agent-conversation.ts`;
const adapterWebSocketPaths = readAdapterWebSocketPaths(
  process.env.ZILOBASE_WEB_ADAPTER_WEBSOCKET_PATHS,
);
const backendTarget = process.env.VITE_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:3000";
const expectedWsProxyErrorCodes = new Set(["ECONNRESET", "EPIPE"]);

function createBackendProxy(options: { ws?: boolean } = {}): ProxyOptions {
  return {
    target: backendTarget,
    changeOrigin: true,
    ...options,
    configure(proxy) {
      if (options.ws) suppressExpectedWsProxyErrors(proxy);
      proxy.on("proxyReq", (proxyRequest, request) => {
        if (request.headers.host?.split(":", 1)[0]?.toLowerCase() !== "demo.localhost") {
          proxyRequest.removeHeader("x-zilobase-demo");
          return;
        }

        for (const header of [
          "authorization",
          "cookie",
          "x-api-key",
          "x-mobile-auth-cookie",
        ]) {
          proxyRequest.removeHeader(header);
        }
        proxyRequest.setHeader("x-zilobase-demo", "1");
      });
    },
  };
}

function suppressExpectedWsProxyErrors(
  proxy: Parameters<NonNullable<ProxyOptions["configure"]>>[0],
) {
  const emit = proxy.emit.bind(proxy);

  proxy.emit = ((eventName: string | symbol, ...args: unknown[]) => {
    if (eventName === "error" && isExpectedWsProxyError(args[0])) {
      return false;
    }

    return emit(eventName, ...args);
  }) as typeof proxy.emit;

  proxy.on("proxyReqWs", (_proxyReq, _req, socket) => {
    const socketEmit = socket.emit.bind(socket);

    socket.emit = ((eventName: string | symbol, ...args: unknown[]) => {
      if (eventName === "error" && isExpectedWsProxyError(args[0])) {
        return false;
      }

      return socketEmit(eventName, ...args);
    }) as typeof socket.emit;
  });
}

function isExpectedWsProxyError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    expectedWsProxyErrorCodes.has(error.code)
  );
}

function readAdapterWebSocketPaths(value: string | undefined) {
  if (!value?.trim()) return [];

  return [...new Set(value.split(",").map((path) => path.trim()).filter(
    (path) => /^\/[a-z0-9/_-]+$/i.test(path),
  ))];
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  envDir: fileURLToPath(new URL("../..", import.meta.url)),
  plugins: [aiDevTracePlugin(repoRoot), react(), tailwindcss()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      {
        find: "@zilobase/ai-conversation-adapter",
        replacement: aiConversationModule,
      },
      {
        find: "@zilobase/edition-web",
        replacement: `${srcDir}/app/edition/community.tsx`,
      },
      { find: "@/packages/editor", replacement: editorDir },
      { find: "@", replacement: srcDir },
      {
        find: "@zilobase/features/databases/property-types",
        replacement: `${featuresDir}/databases/property-types.ts`,
      },
      {
        find: "@zilobase/features/ai-chat/conversation-adapter",
        replacement: `${featuresDir}/ai-chat/conversation-adapter.ts`,
      },
      {
        find: /^@zilobase\/features\/(.+)$/,
        replacement: `${featuresDir}/$1/index.ts`,
      },
      { find: /^@zilobase\/features$/, replacement: `${featuresDir}/index.ts` },
      {
        find: "@zilobase/page-context",
        replacement: `${pageContextDir}/index.ts`,
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
      "/health": createBackendProxy(),
      "/api": createBackendProxy(),
      ...Object.fromEntries(
        adapterWebSocketPaths.map((path) => [
          path,
          createBackendProxy({ ws: true }),
        ]),
      ),
      "/session": createBackendProxy(),
      "/sign-in": createBackendProxy(),
      "/sign-up": createBackendProxy(),
      "/sign-out": createBackendProxy(),
      "/email-otp": createBackendProxy(),
      "/workspace": createBackendProxy(),
      "/search": createBackendProxy(),
      "/pages": createBackendProxy({ ws: true }),
      "/databases": createBackendProxy({ ws: true }),
      "/demo": createBackendProxy(),
      "/database-collaboration": createBackendProxy({ ws: true }),
      "/images": createBackendProxy(),
      "/user-settings": createBackendProxy(),
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
    fs: externalAiConversationModule
      ? {
          allow: [
            searchForWorkspaceRoot(process.cwd()),
            dirname(aiConversationModule),
          ],
        }
      : undefined,
  },
}));
