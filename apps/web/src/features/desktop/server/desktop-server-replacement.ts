import { getApiRequestHeaders } from "@/features/desktop/network/api";
import {
  forgetDesktopAuthCredentials,
  getDesktopAuthToken,
} from "../auth/desktop-auth-token";
import { destroyDesktopOfflineConnections } from "@/features/offline/index";
import {
  beginDesktopServerNetworkShutdown,
  desktopNetworkFetch,
} from "../network/desktop-network";
import { clearDesktopServerIndexedData } from "@/features/offline/index";
import { queryClient } from "@/app/query-client";
import {
  commitDesktopServerCandidate,
  getSelectedDesktopServer,
  type DesktopServer,
} from "./desktop-server";
import type {
  DesktopServerReplacementDependencies,
  DesktopServerReplacementRequest,
} from "./desktop-server-replacement-core";
import { useAppStore } from "@/features/desktop/state/app-store";
import { useAuthFlowStore } from "@/features/auth/state/auth-flow-store";

export type { DesktopServerReplacementRequest };

type ReplacementListener = (request: DesktopServerReplacementRequest) => void;

let replacementListener: ReplacementListener | null = null;
const queuedRequests: DesktopServerReplacementRequest[] = [];

export function requestDesktopServerReplacement(
  request: DesktopServerReplacementRequest,
) {
  if (replacementListener) replacementListener(request);
  else queuedRequests.push(request);
}

export function subscribeDesktopServerReplacement(
  listener: ReplacementListener,
) {
  replacementListener = listener;
  for (const request of queuedRequests.splice(0)) listener(request);
  return () => {
    if (replacementListener === listener) replacementListener = null;
  };
}

export function createDesktopServerReplacementDependencies(input: {
  beforeLocalCleanup: () => Promise<void>;
  reload: (path: string) => void;
}): DesktopServerReplacementDependencies {
  return {
    beforeLocalCleanup: input.beforeLocalCleanup,
    beginNetworkShutdown: beginDesktopServerNetworkShutdown,
    cancelQueries: () => queryClient.cancelQueries(),
    clearIndexedData: clearDesktopServerIndexedData,
    clearStores: clearDesktopServerBrowserState,
    commitCandidate: commitDesktopServerCandidate,
    destroyRealtime: destroyDesktopOfflineConnections,
    forgetCredentials: forgetDesktopAuthCredentials,
    reload: input.reload,
    revokeOldSession: bestEffortRevokeDesktopSession,
  };
}

async function clearDesktopServerBrowserState() {
  queryClient.clear();
  useAppStore.getState().resetAccountState();
  useAuthFlowStore.getState().clearAuthFlow();
  await Promise.all([
    useAppStore.persist.clearStorage(),
    useAuthFlowStore.persist.clearStorage(),
  ]);
  window.localStorage.removeItem("zilobase-app");
  window.localStorage.removeItem("zilobase-auth-flow");
  const server = getSelectedDesktopServer();
  if (server) {
    window.localStorage.removeItem(`zilobase-app:${server.instanceId}`);
    window.localStorage.removeItem(`zilobase-auth-flow:${server.instanceId}`);
  }
  window.sessionStorage.clear();
}

async function bestEffortRevokeDesktopSession(server: DesktopServer) {
  const token = getDesktopAuthToken();
  if (!token) return;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 3_000);
  try {
    const response = await desktopNetworkFetch(
      `${server.apiOrigin}/api/auth/sign-out`,
      {
        body: "{}",
        credentials: "include",
        headers: getApiRequestHeaders({ "content-type": "application/json" }),
        method: "POST",
        signal: controller.signal,
      },
    );
    await response.arrayBuffer();
  } finally {
    window.clearTimeout(timeout);
  }
}
