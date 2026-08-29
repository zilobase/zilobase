import type {
  DesktopServer,
  PreparedDesktopServer,
} from "./desktop-server";

export type DesktopServerReplacementRequest = {
  expectedInstanceId?: string;
  path?: string;
  serverUrl: string;
};

export type DesktopServerReplacementDependencies = {
  beforeLocalCleanup: () => Promise<void>;
  beginNetworkShutdown: () => void;
  cancelQueries: () => Promise<void>;
  clearIndexedData: () => Promise<void>;
  clearStores: () => Promise<void>;
  commitCandidate: (candidateId: string) => Promise<{
    changed: boolean;
    server: DesktopServer;
  }>;
  destroyRealtime: () => void;
  forgetCredentials: () => void;
  reload: (path: string) => void;
  revokeOldSession: (server: DesktopServer) => Promise<void>;
};

export function assertPreparedServerMatchesRequest(
  prepared: PreparedDesktopServer,
  request: DesktopServerReplacementRequest,
) {
  if (
    request.expectedInstanceId &&
    prepared.server.instanceId !== request.expectedInstanceId
  ) {
    throw new Error(
      "This link identifies a different Zilobase instance than the server returned.",
    );
  }
}

export async function executeDesktopServerReplacement(
  prepared: PreparedDesktopServer,
  currentServer: DesktopServer,
  path: string | undefined,
  dependencies: DesktopServerReplacementDependencies,
) {
  await dependencies.revokeOldSession(currentServer).catch(() => undefined);
  dependencies.beginNetworkShutdown();
  await dependencies.beforeLocalCleanup();
  dependencies.destroyRealtime();
  await dependencies.cancelQueries();
  await dependencies.clearIndexedData();
  await dependencies.clearStores();
  const committed = await dependencies.commitCandidate(prepared.candidateId);
  dependencies.forgetCredentials();
  dependencies.reload(path ?? "/login");
  return committed;
}
