import { forgetDesktopAuthCredentials } from "@/lib/desktop-auth-token"
import { beginDesktopServerNetworkShutdown } from "@/lib/desktop-network"
import {
  commitDesktopServerCandidate,
  resolveDesktopServerSwitchPath,
  switchDesktopServerProfile,
  type DesktopServer,
} from "@/lib/desktop-server"
import { destroyDesktopOfflineConnections } from "@/lib/offline-documents"
import { queryClient } from "@/lib/query-client"

export type DesktopServerSwitchRequest = {
  candidateId?: string
  hasCredentials?: boolean
  path?: string
  server: DesktopServer
  workspaceId?: string | null
}

export type DesktopServerSwitchProgress = {
  server: DesktopServer
  workspaceName?: string
}

type SwitchListener = (progress: DesktopServerSwitchProgress | null) => void

let switchListener: SwitchListener | null = null

export function subscribeDesktopServerSwitch(listener: SwitchListener) {
  switchListener = listener
  return () => {
    if (switchListener === listener) switchListener = null
  }
}

export function notifyDesktopServerSwitch(
  progress: DesktopServerSwitchProgress | null,
) {
  switchListener?.(progress)
}

export async function executeDesktopServerSwitch(
  request: DesktopServerSwitchRequest,
) {
  notifyDesktopServerSwitch({
    server: request.server,
  })

  beginDesktopServerNetworkShutdown()
  destroyDesktopOfflineConnections()
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
