import { invoke as tauriInvoke, isTauri as tauriIsTauri } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";
import { getCurrentWindow as tauriCurrentWindow } from "@tauri-apps/api/window";
import { getCurrent as tauriCurrentLinks, onOpenUrl as tauriOnOpenUrl } from "@tauri-apps/plugin-deep-link";

import type { DesktopDeepLink, ZilobaseDesktopBridge } from "../../../../desktop/electron/shared/bridge";

declare global {
  interface Window {
    zilobaseDesktop?: ZilobaseDesktopBridge;
  }
}

export function isElectronDesktop(): boolean {
  return typeof window !== "undefined" && window.zilobaseDesktop?.apiVersion === 1;
}

export function isDesktopApp(): boolean {
  return isElectronDesktop() || tauriIsTauri();
}

function electron(): ZilobaseDesktopBridge {
  const bridge = window.zilobaseDesktop;
  if (!bridge || bridge.apiVersion !== 1) throw new Error("Desktop bridge unavailable");
  return bridge;
}

export async function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!isElectronDesktop()) return tauriInvoke<T>(command, args);
  const desktop = electron();
  const handlers: Record<string, () => Promise<unknown>> = {
    get_auth_token: desktop.auth.getToken,
    set_auth_token: () => desktop.auth.setToken(args.token as string | null),
    get_auth_owner: desktop.auth.getOwner,
    set_auth_owner: () => desktop.auth.setOwner(args.owner as string | null),
    start_browser_authorization: desktop.auth.startBrowser,
    cancel_browser_authorization: desktop.auth.cancelBrowser,
    open_mail_authorization_url: () => desktop.auth.openMailUrl(args.authorizationUrl as string),
    initialize_desktop_server: desktop.server.initialize,
    prepare_desktop_server_candidate: () => desktop.server.prepare(args.serverUrl as string),
    discard_desktop_server_candidate: () => desktop.server.discard(args.candidateId as string),
    commit_desktop_server_candidate: () => desktop.server.commit(args.candidateId as string),
    list_desktop_server_profiles: desktop.server.list,
    switch_desktop_server_profile: () => desktop.server.switch(args as Parameters<typeof desktop.server.switch>[0]),
    update_desktop_server_profile_snapshot: () => desktop.server.updateSnapshot(args as Parameters<typeof desktop.server.updateSnapshot>[0]),
    remove_desktop_server_profile: () => desktop.server.remove(args as Parameters<typeof desktop.server.remove>[0]),
    set_window_opacity: () => desktop.window.setOpacity(args.opacity as number),
    mark_renderer_ready: () => desktop.diagnostics.rendererReady(args.elapsedMs as number),
    record_renderer_diagnostic: () => desktop.diagnostics.record(args.event as string, args.fields as Record<string, unknown>, args.level as "info" | "warn" | "error"),
    get_diagnostics_info: desktop.diagnostics.info,
    open_diagnostics_folder: desktop.diagnostics.openFolder,
    export_diagnostics: desktop.diagnostics.export,
    meeting_capture_list_devices: desktop.capture.listDevices,
    meeting_capture_permissions: desktop.capture.permissions,
    meeting_capture_start: () => desktop.capture.start(args.config as Parameters<typeof desktop.capture.start>[0]),
    meeting_capture_pause: desktop.capture.pause,
    meeting_capture_resume: desktop.capture.resume,
    meeting_capture_stop: desktop.capture.stop,
    meeting_capture_state: desktop.capture.state,
    meeting_capture_refresh_transport: () => desktop.capture.refreshTransport(args.audioWebsocketUrl as string, args.audioTicket as string),
    meeting_capture_recoverable_sessions: desktop.capture.recoverable,
    meeting_capture_delete_local_file: () => desktop.capture.deleteLocal(args.meetingId as string),
    meeting_capture_open_local_file: () => desktop.capture.openLocal(args.meetingId as string),
  };
  const handler = handlers[command];
  if (!handler) throw new Error("Unsupported desktop operation");
  return handler() as Promise<T>;
}

export function listen<T>(event: string, callback: (event: { payload: T }) => void): Promise<() => void> {
  if (!isElectronDesktop()) return tauriListen<T>(event, callback);
  const capture = electron().capture;
  const subscriptions: Record<string, (listener: (value: never) => void) => () => void> = {
    "meeting-capture-state": capture.onState as never,
    "meeting-capture-level": capture.onLevel as never,
    "meeting-capture-warning": capture.onWarning as never,
    "meeting-capture-transcript": capture.onTranscript as never,
  };
  const subscribe = subscriptions[event];
  if (!subscribe) return Promise.reject(new Error("Unsupported desktop event"));
  return Promise.resolve(subscribe((value) => callback({ payload: value as T })));
}

export function getCurrentWindow() {
  if (!isElectronDesktop()) return tauriCurrentWindow();
  const desktop = electron().window;
  return {
    close: desktop.close,
    minimize: desktop.minimize,
    toggleMaximize: desktop.toggleMaximize,
    isMaximized: async () => (await desktop.getState()).maximized,
    onResized: async (listener: () => void) => desktop.onState(listener),
    startDragging: async () => {},
  };
}

function toUrl(link: DesktopDeepLink): string {
  const url = new URL("zilobase://" + link.type);
  url.searchParams.set("server", link.serverUrl);
  if (link.type === "open") {
    url.searchParams.set("instance", link.instanceId);
    url.searchParams.set("path", link.path);
  }
  return url.toString();
}

export function getCurrent(): Promise<string[] | null> {
  if (!isElectronDesktop()) return tauriCurrentLinks();
  return electron().deepLinks.getPending().then((links) => links.map(toUrl));
}

export function onOpenUrl(listener: (urls: string[]) => void): Promise<() => void> {
  if (!isElectronDesktop()) return tauriOnOpenUrl(listener);
  return Promise.resolve(electron().deepLinks.onOpen((links) => listener(links.map(toUrl))));
}

export async function checkUpdate() {
  if (!isElectronDesktop()) {
    const { check } = await import("@tauri-apps/plugin-updater");
    return check();
  }
  const update = await electron().update.check();
  return update ? {
    version: update.version,
    body: update.body,
    downloadAndInstall: () => electron().update.download(),
  } : null;
}

export async function relaunch() {
  if (!isElectronDesktop()) {
    const { relaunch: tauriRelaunch } = await import("@tauri-apps/plugin-process");
    return tauriRelaunch();
  }
  return electron().update.installRestart();
}

export async function requestNotificationPermission() {
  if (!isElectronDesktop()) {
    const native = await import("@tauri-apps/plugin-notification");
    return native.requestPermission();
  }
  return electron().notifications.requestPermission();
}

export async function sendNotification(input: { title: string; body: string }) {
  if (!isElectronDesktop()) {
    const native = await import("@tauri-apps/plugin-notification");
    return native.sendNotification(input);
  }
  return electron().notifications.show(input);
}

export async function isNotificationPermissionGranted() {
  if (!isElectronDesktop()) {
    const native = await import("@tauri-apps/plugin-notification");
    return native.isPermissionGranted();
  }
  return Notification.permission === "granted";
}
