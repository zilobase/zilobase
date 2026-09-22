import { app, BrowserWindow, ipcMain, net, Notification, protocol, session } from "electron";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { activeServer, loadConfig, registerServerHandlers } from "./server.mjs";
import { credentials, registerCredentialHandlers } from "./credentials.mjs";
import { registerOAuthHandlers } from "./oauth.mjs";
import log from "electron-log/main.js";
import { configureLogging, exportDiagnostics, registerDiagnosticsHandlers } from "./diagnostics.mjs";
import { desktopError } from "./server.mjs";
import { registerCaptureHandlers } from "./capture.mjs";

const RENDERER_ORIGIN = "zilo-desktop://app";
const DEV_ORIGIN = "http://localhost:1420";
const isDevelopment = !app.isPackaged;
const diagnosticsOnly = process.argv.includes("--diagnostics");
const startedAt = Date.now();
let mainWindow;
let rendererReady = false;
let deepLinkSubscribed = false;
const pendingLinks = [];

protocol.registerSchemesAsPrivileged([
  { scheme: "zilo-desktop", privileges: {
    standard: true, secure: true, supportFetchAPI: true, corsEnabled: true,
  } },
]);
app.setName("zilobase-client");
if (process.env.ZILOBASE_E2E_USER_DATA) {
  app.setPath("userData", path.resolve(process.env.ZILOBASE_E2E_USER_DATA));
}

function parseDeepLink(value) {
  if (typeof value !== "string" || !value || value.length > 8192) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "zilobase:" || url.username || url.password || url.port || url.pathname || url.hash) return null;
    const expected = url.hostname === "connect" ? ["server"] : url.hostname === "open" ? ["server", "instance", "path"] : null;
    if (!expected || [...url.searchParams.keys()].length !== expected.length ||
        expected.some((key) => url.searchParams.getAll(key).length !== 1)) return null;
    const serverUrl = url.searchParams.get("server");
    if (!serverUrl || serverUrl.length > 2048) return null;
    const server = new URL(serverUrl);
    if (server.username || server.password || server.pathname !== "/" || server.search || server.hash ||
        !["https:", "http:"].includes(server.protocol)) return null;
    if (server.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(server.hostname)) return null;
    if (url.hostname === "connect") return { type: "connect", serverUrl: server.origin };
    if (url.hostname === "open") {
      const instanceId = url.searchParams.get("instance");
      const route = url.searchParams.get("path");
      if (!instanceId || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(instanceId) ||
          !route || !route.startsWith("/") || route.startsWith("//") || route.length > 4096) return null;
      const parsedPath = new URL(route, "https://app.zilobase.com");
      if (parsedPath.origin !== "https://app.zilobase.com") return null;
      return { type: "open", serverUrl: server.origin, instanceId,
        path: parsedPath.pathname + parsedPath.search + parsedPath.hash };
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
    log.info("[diagnostics] event=deep_link.received target=" + (link?.type ?? "other"));
    if (link) pendingLinks.push(link);
  }
  if (deepLinkSubscribed && pendingLinks.length) {
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

if (!diagnosticsOnly && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", (_event, argv) => enqueueLinks(argv));
  enqueueLinks(process.argv);
}

function rendererUrlAllowed(url) {
  try {
    const parsed = new URL(url);
    return isDevelopment
      ? parsed.origin === DEV_ORIGIN
      : parsed.protocol === "zilo-desktop:" && parsed.hostname === "app" &&
        !parsed.port && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function checkedHandler(channel, callback) {
  ipcMain.handle(channel, async (event, payload) => {
    const ownContents = Boolean(mainWindow && event.sender === mainWindow.webContents);
    const mainFrame = Boolean(mainWindow && event.senderFrame === mainWindow.webContents.mainFrame);
    const ownOrigin = Boolean(event.senderFrame && rendererUrlAllowed(event.senderFrame.url));
    if (!ownContents || !mainFrame || !ownOrigin) {
      log.warn("[diagnostics] event=ipc.sender_rejected own_contents=" + ownContents +
        " main_frame=" + mainFrame + " own_origin=" + ownOrigin);
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
    let connect = "'self'";
    try {
      const origin = activeServer(await loadConfig()).apiOrigin;
      connect += " " + origin + " " + origin.replace(/^http/, "ws");
    } catch { /* The profile error is returned through the server bridge. */ }
    headers.set("Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src " +
      connect + "; object-src 'none'; base-uri 'none'; frame-src 'none'");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(response.body, { status: response.status, headers });
  });
}

function installPermissions(ses) {
  const allowed = (contents, permission, origin) =>
    contents === mainWindow?.webContents &&
    rendererUrlAllowed(origin) &&
    permission === "notifications";
  ses.setPermissionCheckHandler((contents, permission, origin) => allowed(contents, permission, origin));
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(allowed(contents, permission, details.requestingUrl || contents.getURL()));
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
    log.info("[diagnostics] event=webview.page_load status=success elapsed_ms=" + (Date.now() - startedAt));
  });
  contents.on("did-start-loading", () => { deepLinkSubscribed = false; });
  for (const event of ["maximize", "unmaximize"]) {
    mainWindow.on(event, () => contents.send("desktop:window:state-changed", { maximized: mainWindow.isMaximized() }));
  }
  void mainWindow.loadURL(isDevelopment ? DEV_ORIGIN : RENDERER_ORIGIN + "/");
}

function registerCoreIpc(registerUpdaterHandlers) {
  const handle = (channel, callback) => checkedHandler(channel, callback);
  registerServerHandlers(handle, credentials);
  registerCredentialHandlers(handle);
  registerOAuthHandlers(handle, () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.show();
    mainWindow?.focus();
  });
  registerDiagnosticsHandlers(handle);
  registerUpdaterHandlers(handle, (state) => mainWindow?.webContents.send("desktop:update:state", state));
  registerCaptureHandlers(handle, (channel, payload) => mainWindow?.webContents.send(channel, payload));
  checkedHandler("desktop:notification:show", ({ title, body }) => {
    if (typeof title !== "string" || !title.trim() || title.length > 160 ||
        typeof body !== "string" || body.length > 1000) {
      throw desktopError("invalid_argument", "The notification is invalid.");
    }
    if (!Notification.isSupported()) throw desktopError("unsupported_platform", "System notifications are unavailable.");
    new Notification({ title, body }).show();
  });
  checkedHandler("desktop:diagnostics:renderer-ready", (payload) => {
    const elapsedMs = Number(payload?.elapsedMs);
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error("Invalid elapsed time");
    rendererReady = true;
    log.info("[diagnostics] event=renderer.app_ready status=success elapsed_ms=" + Math.round(elapsedMs));
  });
  checkedHandler("desktop:deep-link:pending", () => pendingLinks.splice(0));
  checkedHandler("desktop:deep-link:subscribe", () => {
    deepLinkSubscribed = true;
    if (pendingLinks.length) mainWindow.webContents.send("desktop:deep-link:opened", pendingLinks.splice(0));
  });
  checkedHandler("desktop:deep-link:unsubscribe", () => { deepLinkSubscribed = false; });
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
  configureLogging();
  if (diagnosticsOnly) {
    try { console.info(await exportDiagnostics(process.cwd())); }
    catch { console.error("Diagnostics export failed."); }
    app.quit();
    return;
  }
  if (!app.hasSingleInstanceLock()) return;
  const { registerUpdaterHandlers } = await import("./updater.mjs");
  if (!isDevelopment) await installAssetProtocol();
  if (process.platform === "win32" || process.platform === "darwin") app.setAsDefaultProtocolClient("zilobase");
  registerCoreIpc(registerUpdaterHandlers);
  createWindow();
  installPermissions(session.defaultSession);
  setTimeout(() => {
    if (!rendererReady) log.warn("[diagnostics] event=renderer.startup_timeout status=timeout elapsed_ms=15000");
  }, 15_000).unref();
}).catch((error) => {
  log.error("[diagnostics] event=native.startup status=error error_type=" +
    (typeof error?.name === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(error.name) ? error.name : "UnknownError"));
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (!diagnosticsOnly && !BrowserWindow.getAllWindows().length) createWindow();
});
