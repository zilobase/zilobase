import { app } from "electron";
import updaterPackage from "electron-updater";
import log from "electron-log/main.js";
import { existsSync } from "node:fs";
import path from "node:path";
import { desktopError } from "./server.mjs";

let available = null;
let downloaded = false;
let pendingCheck = null;
const { autoUpdater } = updaterPackage;

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.logger = {
  info: () => log.info("[diagnostics] event=updater.activity status=started"),
  warn: () => log.warn("[diagnostics] event=updater.activity status=error"),
  error: () => log.error("[diagnostics] event=updater.activity status=error"),
  debug: () => {},
};

export function registerUpdaterHandlers(handle, emit) {
  autoUpdater.on("download-progress", ({ percent }) => emit({ phase: "downloading", percent: Math.round(percent) }));
  autoUpdater.on("update-downloaded", () => { downloaded = true; emit({ phase: "downloaded" }); });
  autoUpdater.on("error", () => emit({ phase: "error" }));
  handle("desktop:update:check", async () => {
    if (!app.isPackaged || !["darwin", "win32", "linux"].includes(process.platform) ||
        !existsSync(path.join(process.resourcesPath, "app-update.yml"))) return null;
    if (pendingCheck) return pendingCheck;
    pendingCheck = (async () => {
      try {
        const result = await autoUpdater.checkForUpdates();
        const info = result?.updateInfo;
        if (!info || info.version === app.getVersion()) return null;
        available = info;
        return { version: info.version, body: typeof info.releaseNotes === "string" ? info.releaseNotes : null };
      } catch {
        throw desktopError("update_check_failed", "Could not check for a desktop update.");
      } finally { pendingCheck = null; }
    })();
    return pendingCheck;
  });
  handle("desktop:update:download", async () => {
    if (!available) throw desktopError("invalid_state", "Check for an update first.");
    downloaded = false;
    try { await autoUpdater.downloadUpdate(); }
    catch { throw desktopError("update_download_failed", "Could not download the desktop update."); }
  });
  handle("desktop:update:install-restart", () => {
    if (!downloaded) throw desktopError("invalid_state", "Download the update before restarting.");
    autoUpdater.quitAndInstall(false, true);
  });
}
