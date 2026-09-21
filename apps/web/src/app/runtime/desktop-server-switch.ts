import { forgetDesktopAuthCredentials } from "@/platform/auth/desktop-auth-token"
import { beginDesktopServerNetworkShutdown } from "@/platform/network/desktop-network"
import {
  commitDesktopServerCandidate,
  resolveDesktopServerSwitchPath,
  switchDesktopServerProfile,
} from "@/platform/server/desktop-server"
import { queryClient } from "@/app/query-client"

import type { DesktopServerSwitchRequest } from "@/features/desktop/server/desktop-server-switch"

export async function switchDesktopServerSession(
  request: DesktopServerSwitchRequest,
) {
  beginDesktopServerNetworkShutdown()
  await queryClient.cancelQueries()

  if (request.candidateId) {
    await commitDesktopServerCandidate(request.candidateId)
  } else {
    await switchDesktopServerProfile({
      apiOrigin: request.server.apiOrigin,
      instanceId: request.server.instanceId,
      path: request.path,
      workspaceId: request.workspaceId,
    })
  }

  forgetDesktopAuthCredentials()
  const path = resolveDesktopServerSwitchPath(request)
  if (typeof window !== "undefined") {
    window.location.replace(path)
  }
  return path
}
