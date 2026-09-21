import { app, shell } from "electron";
import log from "electron-log/main.js";
import { zipSync, strToU8 } from "fflate";
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { desktopError } from "./server.mjs";

const MAX_LOG_SIZE = 5 * 1024 * 1024;
const MAX_ARCHIVE_SIZE = 6 * 1024 * 1024;
const numericFields = new Set(["duration_ms", "elapsed_ms", "http_status"]);
const booleanFields = new Set(["owner_present", "session_present", "token_present", "user_present", "value_present"]);
const statuses = new Set(["complete", "disabled", "error", "missing", "started", "success", "timeout"]);
const platforms = new Set(["linux", "macos", "windows", "unknown"]);

export function logDirectory() {
  if (process.env.ZILOBASE_E2E_USER_DATA) {
    return path.join(path.resolve(process.env.ZILOBASE_E2E_USER_DATA), "logs");
  }
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Logs", "com.zilobase");
  if (process.platform === "win32") return path.join(process.env.LOCALAPPDATA || app.getPath("userData"), "com.zilobase", "logs");
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "com.zilobase", "logs");
}

export function configureLogging() {
  const directory = logDirectory();
  mkdirSync(directory, { recursive: true });
  log.transports.file.resolvePathFn = () => path.join(directory, "zilobase.log");
  log.transports.file.maxSize = MAX_LOG_SIZE;
  log.transports.file.level = process.env.ZILOBASE_LOG === "debug" ? "debug" : "info";
  log.transports.file.archiveLogFn = (file) => {
    const current = file.toString();
    try {
      for (let index = 3; index >= 1; index--) {
        const source = path.join(directory, `zilobase.${index}.log`);
        const target = path.join(directory, `zilobase.${index + 1}.log`);
        if (index === 3 && existsSync(source)) unlinkSync(source);
        else if (existsSync(source)) renameSync(source, target);
      }
      renameSync(current, path.join(directory, "zilobase.1.log"));
    } catch {
      file.crop(256 * 1024);
    }
  };
  log.info("[diagnostics] event=native.environment app_version=" + app.getVersion() +
    " os=" + process.platform + " arch=" + process.arch + " package=" + (app.isPackaged ? "packaged" : "development"));
}

export function formatRendererEvent(event, fields) {
  if (typeof event !== "string" || !/^[a-z][a-z0-9_.-]{0,63}$/.test(event) ||
      !fields || typeof fields !== "object" || Array.isArray(fields)) {
    throw desktopError("invalid_argument", "The diagnostic event is invalid.");
  }
  const parts = [`[diagnostics] event=${event}`];
  for (const [key, value] of Object.entries(fields).sort(([left], [right]) => left.localeCompare(right))) {
    if (numericFields.has(key) && typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER) {
      parts.push(`${key}=${Math.round(value)}`);
    } else if (booleanFields.has(key) && typeof value === "boolean") {
      parts.push(`${key}=${value}`);
    } else if (key === "status" && statuses.has(value)) {
      parts.push(`${key}=${value}`);
    } else if (key === "platform" && platforms.has(value)) {
      parts.push(`${key}=${value}`);
    } else if ((key === "error_type" || key === "value_kind") && typeof value === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(value)) {
      parts.push(`${key}=${value}`);
    }
  }
  return parts.join(" ");
}

export async function exportDiagnostics(outputDirectory) {
  const directory = logDirectory();
  await mkdir(directory, { recursive: true });
  const files = readdirSync(directory)
    .filter((name) => /^zilobase(?:\.\d+)?\.log$/.test(name))
    .sort((left, right) => statSync(path.join(directory, right)).mtimeMs - statSync(path.join(directory, left)).mtimeMs)
    .slice(0, 4);
  const manifest = {
    schemaVersion: 1,
    generatedAtUnixSeconds: Math.floor(Date.now() / 1000),
    appVersion: app.getVersion(),
    buildCommit: process.env.ZILOBASE_BUILD_COMMIT || "unknown",
    operatingSystem: process.platform,
    architecture: process.arch,
    packageKind: process.env.APPIMAGE ? "appimage" : app.isPackaged ? "packaged" : "development",
    linuxDistribution: null,
    displayServer: process.platform === "linux" ? (process.env.WAYLAND_DISPLAY ? "wayland" : "x11") : "unknown",
    archivedLogFiles: files,
  };
  const entries = { "diagnostics.json": strToU8(JSON.stringify(manifest, null, 2)) };
  for (const name of files) entries[`logs/${name}`] = (await readFile(path.join(directory, name))).subarray(0, MAX_ARCHIVE_SIZE);
  const targetDirectory = outputDirectory ||
    (process.env.ZILOBASE_E2E_USER_DATA
      ? path.join(path.resolve(process.env.ZILOBASE_E2E_USER_DATA), "downloads")
      : app.getPath("downloads"));
  await mkdir(targetDirectory, { recursive: true });
  const output = path.join(targetDirectory, `zilobase-diagnostics-${Date.now()}-${process.pid}.zip`);
  await writeFile(output, zipSync(entries, { level: 0 }), { mode: 0o600 });
  return output;
}

export function registerDiagnosticsHandlers(handle) {
  handle("desktop:diagnostics:record", ({ event, fields, level }) => {
    if (!["info", "warn", "error"].includes(level)) throw desktopError("invalid_argument", "The diagnostic level is invalid.");
    log[level](formatRendererEvent(event, fields));
  });
  handle("desktop:diagnostics:info", async () => {
    await mkdir(logDirectory(), { recursive: true });
    return { logDirectory: logDirectory() };
  });
  handle("desktop:diagnostics:open-folder", async () => {
    await mkdir(logDirectory(), { recursive: true });
    const error = await shell.openPath(logDirectory());
    if (error) throw desktopError("operation_failed", "The diagnostics folder could not be opened.");
  });
  handle("desktop:diagnostics:export", async () => exportDiagnostics());
}
