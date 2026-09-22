const { contextBridge, ipcRenderer } = require("electron");

async function call(channel, payload = {}) {
  const result = await ipcRenderer.invoke(channel, payload);
  if (result?.ok) return result.value;
  throw {
    name: "DesktopError",
    code: result?.error?.code || "operation_failed",
    message: result?.error?.message || "Desktop operation failed.",
  };
}
function subscribe(channel, callback) {
  const handler = (_event, value) => callback(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
}
const invoke = (channel) => (payload) => call(channel, payload);
const bridge = {
  apiVersion: 1,
  platform: process.platform,
  auth: {
    getToken: invoke("desktop:auth:get-token"),
    setToken: (token) => call("desktop:auth:set-token", { token }),
    getOwner: invoke("desktop:auth:get-owner"),
    setOwner: (owner) => call("desktop:auth:set-owner", { owner }),
    startBrowser: invoke("desktop:auth:start-browser"),
    cancelBrowser: invoke("desktop:auth:cancel-browser"),
    openMailUrl: (authorizationUrl) => call("desktop:auth:open-mail-url", { authorizationUrl }),
  },
  server: {
    initialize: invoke("desktop:server:initialize"),
    prepare: (serverUrl) => call("desktop:server:prepare", { serverUrl }),
    discard: (candidateId) => call("desktop:server:discard", { candidateId }),
    commit: (candidateId) => call("desktop:server:commit", { candidateId }),
    list: invoke("desktop:server:list"),
    switch: invoke("desktop:server:switch"),
    updateSnapshot: invoke("desktop:server:update-snapshot"),
    remove: invoke("desktop:server:remove"),
    developmentTargets: invoke("desktop:server:development-targets"),
  },
  window: {
    minimize: invoke("desktop:window:minimize"),
    toggleMaximize: invoke("desktop:window:toggle-maximize"),
    close: invoke("desktop:window:close"),
    getState: invoke("desktop:window:get-state"),
    setOpacity: (opacity) => call("desktop:window:set-opacity", { opacity }),
    onState: (callback) => subscribe("desktop:window:state-changed", callback),
  },
  deepLinks: {
    getPending: invoke("desktop:deep-link:pending"),
    onOpen: (callback) => {
      const stop = subscribe("desktop:deep-link:opened", callback);
      void call("desktop:deep-link:subscribe").catch(() => {});
      return () => {
        stop();
        void call("desktop:deep-link:unsubscribe").catch(() => {});
      };
    },
  },
  diagnostics: {
    rendererReady: (elapsedMs) => call("desktop:diagnostics:renderer-ready", { elapsedMs }),
    record: (event, fields, level) => call("desktop:diagnostics:record", { event, fields, level }),
    info: invoke("desktop:diagnostics:info"),
    openFolder: invoke("desktop:diagnostics:open-folder"),
    export: invoke("desktop:diagnostics:export"),
  },
  capture: {
    listDevices: invoke("desktop:capture:list-devices"),
    permissions: invoke("desktop:capture:permissions"),
    start: invoke("desktop:capture:start"),
    pause: invoke("desktop:capture:pause"),
    resume: invoke("desktop:capture:resume"),
    stop: invoke("desktop:capture:stop"),
    state: invoke("desktop:capture:state"),
    refreshTransport: (audioWebsocketUrl, audioTicket) =>
      call("desktop:capture:refresh-transport", { audioWebsocketUrl, audioTicket }),
    recoverable: invoke("desktop:capture:recoverable"),
    deleteLocal: (meetingId) => call("desktop:capture:delete-local", { meetingId }),
    openLocal: (meetingId) => call("desktop:capture:open-local", { meetingId }),
    onState: (callback) => subscribe("desktop:capture:state-changed", callback),
    onLevel: (callback) => subscribe("desktop:capture:level", callback),
    onWarning: (callback) => subscribe("desktop:capture:warning", callback),
    onTranscript: (callback) => subscribe("desktop:capture:transcript", callback),
  },
  notifications: {
    requestPermission: () => Notification.requestPermission(),
    show: invoke("desktop:notification:show"),
  },
  update: {
    check: invoke("desktop:update:check"),
    download: invoke("desktop:update:download"),
    installRestart: invoke("desktop:update:install-restart"),
    onState: (callback) => subscribe("desktop:update:state", callback),
  },
};

contextBridge.exposeInMainWorld("zilobaseDesktop", bridge);
