import { dirname, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, searchForWorkspaceRoot, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { aiDevTracePlugin } from "./vite/ai-dev-trace-plugin";

const host = process.env.TAURI_DEV_HOST;
const devPort = readPort(process.env.VITE_DEV_PORT, 1420);
const hmrPort = readPort(process.env.VITE_HMR_PORT, devPort + 1);
const viteCacheDir = process.env.ZILOBASE_VITE_CACHE_DIR?.trim();
const srcDir = fileURLToPath(new URL("./src", import.meta.url));
const editorDir = fileURLToPath(
  new URL("./src/features/editor", import.meta.url),
);
const pageContextDir = fileURLToPath(
  new URL("../../packages/page-context/src", import.meta.url),
);
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const externalAiConversationModule =
  process.env.ZILOBASE_WEB_AI_CONVERSATION_MODULE?.trim();
const externalEditionWebModule =
  process.env.ZILOBASE_WEB_EDITION_MODULE?.trim();
const aiConversationModule = externalAiConversationModule
  ? resolve(externalAiConversationModule)
  : `${srcDir}/features/ai/conversations/use-agent-conversation.ts`;
const editionWebModule = externalEditionWebModule
  ? resolve(externalEditionWebModule)
  : `${srcDir}/edition/community-module.ts`;
const externalModuleDirectories = [
  externalAiConversationModule ? dirname(aiConversationModule) : null,
  externalEditionWebModule ? dirname(editionWebModule) : null,
].filter((directory): directory is string => directory !== null);
const adapterWebSocketPaths = readAdapterWebSocketPaths(
  process.env.ZILOBASE_WEB_ADAPTER_WEBSOCKET_PATHS,
);
const backendTarget =
  process.env.VITE_BACKEND_PROXY_TARGET ?? process.env.VITE_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:3000";
const expectedWsProxyErrorCodes = new Set(["ECONNRESET", "EPIPE"]);

function createBackendProxy(options: { ws?: boolean } = {}): ProxyOptions {
  return {
    target: backendTarget,
    changeOrigin: true,
    ...options,
    configure(proxy) {
      if (options.ws) suppressExpectedWsProxyErrors(proxy);
      proxy.on("proxyReq", (proxyRequest, request) => {
        if (
          request.headers.host?.split(":", 1)[0]?.toLowerCase() !==
          "demo.localhost"
        ) {
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

  return [
    ...new Set(
      value
        .split(",")
        .map((path) => path.trim())
        .filter((path) => /^\/[a-z0-9/_-]+$/i.test(path)),
    ),
  ];
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  ...(viteCacheDir ? { cacheDir: resolve(viteCacheDir) } : {}),
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
        replacement: editionWebModule,
      },
      { find: "@/packages/editor", replacement: editorDir },
      { find: "@", replacement: srcDir },
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
  build: {
    manifest: true,
    sourcemap: process.env.POSTHOG_SOURCEMAPS === "true" ? "hidden" : false,
  },
  // Bump this value whenever a released local-dev setup may have left browsers
  // with immutable optimized-dependency entries. It changes Vite's dependency
  // hash without affecting application behavior, so previously cached module
  // graphs cannot reference chunks removed by a later optimization pass.
  optimizeDeps: {
    esbuildOptions: {
      define: {
        __ZILOBASE_OPTIMIZE_DEPS_CACHE_REVISION__: JSON.stringify("2"),
      },
    },
  },
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: devPort,
    strictPort: true,
    ...(process.env.VITE_DEV_PUBLIC_ORIGIN ? { allowedHosts: [new URL(process.env.VITE_DEV_PUBLIC_ORIGIN).hostname] } : {}),
    host: host || process.env.VITE_DEV_HOST || "0.0.0.0",
    // Local runtime profiles reuse stable cache directories. Prevent a
    // browser from retaining an optimized-dependency response across a Vite
    // cache regeneration, which otherwise leaves old chunk URLs returning
    // `504 Outdated Optimize Dep` until that browser's site cache is cleared.
    headers: {
      "Cache-Control": "no-store",
    },
    proxy: {
      "/health": createBackendProxy(),
      "/ready": createBackendProxy(),
      "/.well-known": createBackendProxy(),
      "/mail/oauth/": createBackendProxy(),
      "/mail/google/": createBackendProxy(),
      "/mail-realtime": createBackendProxy({ ws: true }),
      "/collaboration": createBackendProxy({ ws: true }),
      "/navigation-realtime": createBackendProxy({ ws: true }),
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
          port: hmrPort,
        }
      : process.env.VITE_HMR_PORT
        ? {
            port: hmrPort,
            clientPort: hmrPort,
          }
        : undefined,
    watch: {
      // 3. tell Vite to ignore watching the desktop shell
      ignored: ["**/src-tauri/**", "../desktop/src-tauri/**"],
    },
    fs: externalModuleDirectories.length > 0
      ? {
          allow: [
            searchForWorkspaceRoot(process.cwd()),
            ...externalModuleDirectories,
          ],
        }
      : undefined,
  },
}));

function readPort(value: string | undefined, fallback: number) {
  const port = Number(value);
  return Number.isSafeInteger(port) && port > 0 && port <= 65_535
    ? port
    : fallback;
}
