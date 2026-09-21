import { app, BrowserWindow, ipcMain, net, protocol, session } from "electron";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RENDERER_ORIGIN = "zilo-desktop://app";
const DEV_ORIGIN = "http://localhost:1420";
const isDevelopment = !app.isPackaged;
const startedAt = Date.now();
let mainWindow;
let rendererReady = false;
const pendingLinks = [];

protocol.registerSchemesAsPrivileged([
  { scheme: "zilo-desktop", privileges: {
    standard: true, secure: true, supportFetchAPI: true, corsEnabled: true,
  } },
]);
app.setName("zilobase-client");

function parseDeepLink(value) {
  if (typeof value !== "string" || value.length > 8192) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "zilobase:" || url.username || url.password) return null;
    const serverUrl = url.searchParams.get("server");
    if (!serverUrl) return null;
    const server = new URL(serverUrl);
    if (server.href !== server.origin + "/" || !["https:", "http:"].includes(server.protocol)) return null;
    if (server.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(server.hostname)) return null;
    if (url.hostname === "connect") return { type: "connect", serverUrl: server.origin };
    if (url.hostname === "open") {
      const instanceId = url.searchParams.get("instance");
      const route = url.searchParams.get("path");
      if (!instanceId || !route || !route.startsWith("/") || route.startsWith("//")) return null;
      return { type: "open", serverUrl: server.origin, instanceId, path: route };
    }
  } catch {
    return null;
  }
  return null;
}

function enqueueLinks(args) {
  for (const arg of args) {
    if (typeof arg !== "string" || !arg.startsWith("zilobase://")) continue;
    const link = parseDeepLink(arg);
    console.info("[diagnostics] event=deep_link.received target=" + (link?.type ?? "other"));
    if (link) pendingLinks.push(link);
  }
  if (rendererReady && pendingLinks.length) {
    mainWindow?.webContents.send("desktop:deep-link:opened", pendingLinks.splice(0));
  }
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
}

if (process.platform === "darwin") {
  app.on("open-url", (event, url) => {
    event.preventDefault();
    enqueueLinks([url]);
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", (_event, argv) => enqueueLinks(argv));
  enqueueLinks(process.argv);
}

function rendererUrlAllowed(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin === (isDevelopment ? DEV_ORIGIN : RENDERER_ORIGIN);
  } catch {
    return false;
  }
}

function checkedHandler(channel, callback) {
  ipcMain.handle(channel, async (event, payload) => {
    if (!mainWindow || event.sender !== mainWindow.webContents ||
        event.senderFrame !== mainWindow.webContents.mainFrame ||
        !rendererUrlAllowed(event.senderFrame.url)) {
      return { ok: false, error: { code: "forbidden_sender", message: "Desktop request denied." } };
    }
    try {
      return { ok: true, value: await callback(payload) };
    } catch (error) {
      return { ok: false, error: {
        code: typeof error?.code === "string" ? error.code : "operation_failed",
        message: typeof error?.safeMessage === "string" ? error.safeMessage : "Desktop operation failed.",
      } };
    }
  });
}

async function installAssetProtocol() {
  const base = path.resolve(process.resourcesPath, "web");
  protocol.handle("zilo-desktop", async (request) => {
    const url = new URL(request.url);
    if (url.host !== "app") return new Response("Not found", { status: 404 });
    const requested = decodeURIComponent(url.pathname);
    const candidate = path.resolve(base, "." + requested);
    if (candidate !== base && !candidate.startsWith(base + path.sep)) {
      return new Response("Not found", { status: 404 });
    }
    const asset = existsSync(candidate) && (await stat(candidate)).isFile()
      ? candidate
      : path.join(base, "index.html");
    const response = await net.fetch(pathToFileURL(asset).href);
    const headers = new Headers(response.headers);
    headers.set("Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.zilobase.com wss://api.zilobase.com; object-src 'none'; base-uri 'none'; frame-src 'none'");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(response.body, { status: response.status, headers });
  });
}

function installPermissions(ses) {
  const allowed = (contents, permission, origin) =>
    contents === mainWindow?.webContents &&
    origin === (isDevelopment ? DEV_ORIGIN : RENDERER_ORIGIN) &&
    permission === "notifications";
  ses.setPermissionCheckHandler((contents, permission, origin) => allowed(contents, permission, origin));
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    let origin = "";
    try {
      origin = new URL(details.requestingUrl || contents.getURL()).origin;
    } catch {
      callback(false);
      return;
    }
    callback(allowed(contents, permission, origin));
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: "zilobase-client",
    width: 900, height: 650, minWidth: 900, minHeight: 650,
    show: false,
    titleBarStyle: process.platform === "linux" ? "default" : "hidden",
    titleBarOverlay: process.platform === "win32" ? { height: 36 } : false,
    frame: process.platform !== "linux",
    webPreferences: {
      preload: path.resolve(app.getAppPath(), "electron/preload/index.cjs"),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      webviewTag: false,
    },
  });
  const contents = mainWindow.webContents;
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event, url) => {
    if (!rendererUrlAllowed(url)) event.preventDefault();
  });
  contents.on("did-finish-load", () => {
    mainWindow.show();
    console.info("[diagnostics] event=webview.page_load status=success elapsed_ms=" + (Date.now() - startedAt));
  });
  for (const event of ["maximize", "unmaximize"]) {
    mainWindow.on(event, () => contents.send("desktop:window:state-changed", { maximized: mainWindow.isMaximized() }));
  }
  void mainWindow.loadURL(isDevelopment ? DEV_ORIGIN : RENDERER_ORIGIN + "/");
}

function registerCoreIpc() {
  checkedHandler("desktop:diagnostics:renderer-ready", (payload) => {
    const elapsedMs = Number(payload?.elapsedMs);
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error("Invalid elapsed time");
    rendererReady = true;
    console.info("[diagnostics] event=renderer.app_ready status=success elapsed_ms=" + Math.round(elapsedMs));
    if (pendingLinks.length) mainWindow.webContents.send("desktop:deep-link:opened", pendingLinks.splice(0));
  });
  checkedHandler("desktop:deep-link:pending", () => pendingLinks.splice(0));
  checkedHandler("desktop:window:minimize", () => mainWindow.minimize());
  checkedHandler("desktop:window:toggle-maximize", () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
  checkedHandler("desktop:window:close", () => mainWindow.close());
  checkedHandler("desktop:window:get-state", () => ({ maximized: mainWindow.isMaximized() }));
  checkedHandler("desktop:window:set-opacity", (payload) => {
    const opacity = payload?.opacity;
    if (typeof opacity !== "number" || !Number.isFinite(opacity) || opacity < 0.6 || opacity > 1) {
      const error = new Error("Invalid opacity");
      error.code = "invalid_argument";
      throw error;
    }
    mainWindow.setOpacity(opacity);
  });
}

app.whenReady().then(async () => {
  if (!app.hasSingleInstanceLock()) return;
  if (!isDevelopment) await installAssetProtocol();
  if (process.platform === "win32" || process.platform === "darwin") app.setAsDefaultProtocolClient("zilobase");
  registerCoreIpc();
  createWindow();
  installPermissions(session.defaultSession);
  setTimeout(() => {
    if (!rendererReady) console.warn("[diagnostics] event=renderer.startup_timeout status=timeout elapsed_ms=15000");
  }, 15_000).unref();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (!BrowserWindow.getAllWindows().length) createWindow();
});
