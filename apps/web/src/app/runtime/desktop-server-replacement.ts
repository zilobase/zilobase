import { getApiRequestHeaders } from "@/platform/network/api";
import {
  forgetDesktopAuthCredentials,
  getDesktopAuthToken,
} from "@/platform/auth/desktop-auth-token";
import {
  beginDesktopServerNetworkShutdown,
  desktopNetworkFetch,
} from "@/platform/network/desktop-network";
import { clearIndexedDataForServer } from "@/platform/storage/indexed-data-cleanup";
import { queryClient } from "@/app/query-client";
import {
  commitDesktopServerCandidate,
  getSelectedDesktopServer,
  type DesktopServer,
} from "@/platform/server/desktop-server";
import type {
  DesktopServerReplacementDependencies,
} from "@/features/desktop/server/desktop-server-replacement-core";
import { useAppStore } from "@/features/desktop/state/app-store";
import { useAuthFlowStore } from "@/features/auth/state/auth-flow-store";

export function createDesktopServerReplacementDependencies(input: {
  beforeLocalCleanup: () => Promise<void>;
  reload: (path: string) => void;
}): DesktopServerReplacementDependencies {
  return {
    beforeLocalCleanup: input.beforeLocalCleanup,
    beginNetworkShutdown: beginDesktopServerNetworkShutdown,
    cancelQueries: () => queryClient.cancelQueries(),
    clearIndexedData: () => clearIndexedDataForServer(getSelectedDesktopServer()),
    clearStores: clearDesktopServerBrowserState,
    commitCandidate: commitDesktopServerCandidate,
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
