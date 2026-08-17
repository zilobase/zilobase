import { getApiRequestHeaders } from "@/lib/api";
import {
  forgetDesktopAuthCredentials,
  getDesktopAuthToken,
} from "@/lib/desktop-auth-token";
import { destroyDesktopOfflineConnections } from "@/lib/offline-documents";
import {
  beginDesktopServerNetworkShutdown,
  desktopNetworkFetch,
} from "@/lib/desktop-network";
import { clearDesktopServerIndexedData } from "@/lib/offline-store";
import { queryClient } from "@/lib/query-client";
import {
  commitDesktopServerCandidate,
  getSelectedDesktopServer,
  type DesktopServer,
} from "@/lib/desktop-server";
import type {
  DesktopServerReplacementDependencies,
  DesktopServerReplacementRequest,
} from "@/lib/desktop-server-replacement-core";
import { useAppStore } from "@/stores/app-store";
import { useAuthFlowStore } from "@/stores/auth-flow-store";

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

export async function clearDesktopServerBrowserState() {
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
