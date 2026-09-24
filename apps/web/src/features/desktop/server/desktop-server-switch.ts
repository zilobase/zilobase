import type { DesktopServer } from "@/platform/server/desktop-server";

export type DesktopServerSwitchRequest = {
  candidateId?: string;
  hasCredentials?: boolean;
  path?: string;
  server: DesktopServer;
  workspaceId?: string | null;
};

export type DesktopServerSwitchProgress = {
  server: DesktopServer;
  workspaceName?: string;
};

type SwitchListener = (progress: DesktopServerSwitchProgress | null) => void;

let switchListener: SwitchListener | null = null;

export function subscribeDesktopServerSwitch(listener: SwitchListener) {
  switchListener = listener;
  return () => {
    if (switchListener === listener) switchListener = null;
  };
}

function notifyDesktopServerSwitch(progress: DesktopServerSwitchProgress | null) {
  switchListener?.(progress);
}

type SwitchExecutor = (request: DesktopServerSwitchRequest) => Promise<string>;
let switchExecutor: SwitchExecutor | null = null;

export function installDesktopServerSwitch(executor: SwitchExecutor) {
  switchExecutor = executor;
}

export async function executeDesktopServerSwitch(request: DesktopServerSwitchRequest) {
  if (!switchExecutor) throw new Error("Desktop server switching is not configured.");
  notifyDesktopServerSwitch({ server: request.server });
  return switchExecutor(request);
}
