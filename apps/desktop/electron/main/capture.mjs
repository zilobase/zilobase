import { app, shell, systemPreferences } from "electron";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { desktopError } from "./server.mjs";

const events = new Map([
  ["meeting-capture-state", "desktop:capture:state-changed"],
  ["meeting-capture-level", "desktop:capture:level"],
  ["meeting-capture-warning", "desktop:capture:warning"],
  ["meeting-capture-transcript", "desktop:capture:transcript"],
]);
const defaultState = {
  activeSources: [], meetingId: null, phase: "idle", elapsedMs: 0,
  sampleRate: 24_000, checkpointPath: null, error: null, warnings: [],
};
let child = null;
let serial = 0;
let buffered = "";
let lastState = defaultState;
const requests = new Map();

function binaryPath() {
  const name = "zilobase-desktop-sidecar" + (process.platform === "win32" ? ".exe" : "");
  return app.isPackaged
    ? path.join(process.resourcesPath, "sidecar", name)
    : path.join(app.getAppPath(), "electron", "bin", name);
}

function rejectPending() {
  for (const { reject, timer } of requests.values()) {
    clearTimeout(timer);
    reject(desktopError("capture_unavailable", "The audio capture process stopped."));
  }
  requests.clear();
}

function startProcess(emit) {
  if (child && !child.killed) return child;
  const binary = binaryPath();
  if (!existsSync(binary)) throw desktopError("capture_unavailable", "The audio capture helper is unavailable.");
  const worker = spawn(binary, ["--capture-service", app.getPath("userData")], {
    stdio: ["pipe", "pipe", "ignore"],
  });
  child = worker;
  buffered = "";
  worker.stdout.setEncoding("utf8");
  worker.stdout.on("data", (data) => {
    buffered += data;
    if (buffered.length > 1_048_576) {
      worker.kill();
      return;
    }
    while (true) {
      const end = buffered.indexOf("\n");
      if (end < 0) break;
      const line = buffered.slice(0, end);
      buffered = buffered.slice(end + 1);
      let message;
      try { message = JSON.parse(line); } catch { worker.kill(); return; }
      if (typeof message.event === "string" && events.has(message.event)) {
        if (message.event === "meeting-capture-state") lastState = message.payload;
        emit(events.get(message.event), message.payload);
      } else if (Number.isSafeInteger(message.id) && requests.has(message.id)) {
        const request = requests.get(message.id);
        requests.delete(message.id);
        clearTimeout(request.timer);
        if (message.ok) request.resolve(message.value);
        else request.reject(desktopError("capture_failed", "Meeting capture could not complete: " +
          (typeof message.error === "string" ? message.error.slice(0, 300) : "unknown error")));
      }
    }
  });
  worker.on("error", () => rejectPending());
  worker.on("exit", () => {
    if (child === worker) child = null;
    rejectPending();
    if (["starting", "recording", "paused"].includes(lastState.phase)) {
      lastState = { ...lastState, phase: "error", error: "Audio capture stopped unexpectedly." };
      emit("desktop:capture:state-changed", lastState);
    }
  });
  return worker;
}

function send(action, payload, emit, timeoutMs = 30_000) {
  const worker = startProcess(emit);
  const id = ++serial;
  const line = JSON.stringify({ id, action, payload });
  if (line.length > 16_384) throw desktopError("invalid_argument", "The capture request is too large.");
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      requests.delete(id);
      worker.kill();
      reject(desktopError("capture_timeout", "The audio capture process did not respond."));
    }, timeoutMs);
    requests.set(id, { resolve, reject, timer });
    worker.stdin.write(line + "\n", (error) => {
      if (error && requests.has(id)) {
        requests.delete(id);
        clearTimeout(timer);
        reject(desktopError("capture_unavailable", "The audio capture process stopped."));
      }
    });
  });
}

function validateTransport(urlValue, ticket) {
  let url;
  try { url = new URL(urlValue); }
  catch { throw desktopError("invalid_argument", "The meeting audio URL is invalid."); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "wss:" && !(url.protocol === "ws:" && loopback)) ||
      url.username || url.password || url.hash || url.href.length > 4096 ||
      typeof ticket !== "string" || !/^[A-Za-z0-9._~-]{1,2048}$/.test(ticket)) {
    throw desktopError("invalid_argument", "The meeting audio transport is invalid.");
  }
}

export function registerCaptureHandlers(handle, emit) {
  const call = (action, timeout) => (payload) => send(action, payload, emit, timeout);
  const statusAction = (action, timeout) => async (payload) => {
    const state = await send(action, payload, emit, timeout);
    lastState = state;
    return state;
  };
  handle("desktop:capture:list-devices", call("list-devices", 10_000));
  handle("desktop:capture:permissions", call("permissions", 10_000));
  handle("desktop:capture:start", async (config) => {
    if (!config || typeof config !== "object") throw desktopError("invalid_argument", "The meeting capture configuration is invalid.");
    if (typeof config.meetingId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(config.meetingId) ||
        (config.captureMicrophone != null && typeof config.captureMicrophone !== "boolean") ||
        (config.captureSystemAudio != null && typeof config.captureSystemAudio !== "boolean")) {
      throw desktopError("invalid_argument", "The meeting capture configuration is invalid.");
    }
    if (config.audioWebsocketUrl != null || config.audioTicket != null) {
      validateTransport(config.audioWebsocketUrl, config.audioTicket);
    }
    if (process.platform === "darwin" && (config.captureMicrophone !== false || config.captureSystemAudio === true)) {
      const granted = await systemPreferences.askForMediaAccess("microphone");
      if (!granted) throw desktopError("microphone_access_denied", "Allow microphone access in macOS Settings to record meeting audio.");
    }
    const state = await send("start", config, emit, 15_000);
    lastState = state;
    return state;
  });
  handle("desktop:capture:pause", statusAction("pause"));
  handle("desktop:capture:resume", statusAction("resume"));
  handle("desktop:capture:stop", async () => {
    const state = await send("stop", {}, emit, 35_000);
    lastState = state;
    return state;
  });
  handle("desktop:capture:state", statusAction("state", 10_000));
  handle("desktop:capture:refresh-transport", (payload) => {
    validateTransport(payload?.audioWebsocketUrl, payload?.audioTicket);
    return send("refresh-transport", payload, emit, 10_000);
  });
  handle("desktop:capture:recoverable", call("recoverable", 10_000));
  handle("desktop:capture:delete-local", call("delete-local", 10_000));
  handle("desktop:capture:open-local", async ({ meetingId }) => {
    const audioPath = await send("open-local", { meetingId }, emit, 10_000);
    const failure = await shell.openPath(audioPath);
    if (failure) throw desktopError("capture_failed", "The local audio file could not be opened.");
  });
  app.on("before-quit", () => child?.stdin.end());
}
