import { invoke, isTauri } from "@tauri-apps/api/core"
import packageJson from "../../package.json"

export type DesktopServer = {
  instanceId: string
  displayName: string
  issuer: string
  webOrigin: string
  apiOrigin: string
  protocolVersion: 1
  serverVersion: string
  minimumDesktopVersion: string
}

type DesktopServerFailure = {
  code?: unknown
  message?: unknown
}

export class DesktopServerError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "DesktopServerError"
    this.code = code
  }
}

export const CLOUD_DESKTOP_SERVER: DesktopServer = {
  instanceId: "zilobase-cloud",
  displayName: "Zilobase Cloud",
  issuer: "https://api.zilobase.com",
  webOrigin: "https://app.zilobase.com",
  apiOrigin: "https://api.zilobase.com",
  protocolVersion: 1,
  serverVersion: packageJson.version,
  minimumDesktopVersion: packageJson.version,
}

let selectedDesktopServer: DesktopServer | null = null

export async function initializeDesktopServer() {
  if (!isTauri()) return null

  try {
    selectedDesktopServer = validateDesktopServer(
      await invoke<DesktopServer>("initialize_desktop_server"),
    )
    return selectedDesktopServer
  } catch (error) {
    selectedDesktopServer = null
    throw normalizeDesktopServerError(error)
  }
}

export async function verifyAndSelectDesktopServer(serverUrl: string) {
  if (!isTauri()) {
    throw new DesktopServerError(
      "desktop_required",
      "Custom desktop servers can only be selected in Zilobase Desktop.",
    )
  }

  try {
    selectedDesktopServer = validateDesktopServer(
      await invoke<DesktopServer>("verify_and_select_desktop_server", {
        serverUrl,
      }),
    )
    return selectedDesktopServer
  } catch (error) {
    throw normalizeDesktopServerError(error)
  }
}

export function getSelectedDesktopServer() {
  return selectedDesktopServer
}

export function resolveDesktopServerUrls(server: DesktopServer) {
  const websocketOrigin = server.apiOrigin.replace(/^http/, "ws")

  return {
    apiOrigin: server.apiOrigin,
    collaborationUrl: `${websocketOrigin}/collaboration`,
    imageOrigin: server.apiOrigin,
    realtimeUrl: `${websocketOrigin}/database-collaboration`,
    webOrigin: server.webOrigin,
  }
}

export function resolveRuntimeWebSocketUrl(
  configuredUrl: string,
  channel: "collaboration" | "realtime",
  desktopServer = selectedDesktopServer,
) {
  if (!desktopServer) return configuredUrl

  const configured = new URL(configuredUrl)
  if (configured.protocol !== "ws:" && configured.protocol !== "wss:") {
    throw new DesktopServerError(
      "invalid_server_metadata",
      "The server returned an invalid realtime URL.",
    )
  }

  const urls = resolveDesktopServerUrls(desktopServer)
  const resolved = new URL(
    channel === "collaboration" ? urls.collaborationUrl : urls.realtimeUrl,
  )
  resolved.search = configured.search
  return resolved.toString()
}

export function resolveRuntimeApiOrigin(
  location = typeof window !== "undefined" ? window.location : undefined,
  desktopServer = selectedDesktopServer,
) {
  if (isDesktopLocation(location)) {
    return desktopServer?.apiOrigin ?? CLOUD_DESKTOP_SERVER.apiOrigin
  }

  if (location?.hostname === "app.zilobase.com") {
    return ""
  }

  const configured = import.meta.env.VITE_API_URL?.replace(/\/$/, "")
  return configured && configured !== "/api" ? configured : ""
}

export function isDesktopLocation(
  location: Pick<Location, "hostname" | "protocol"> | URL | undefined,
) {
  return (
    location?.protocol === "tauri:" ||
    location?.hostname === "tauri.localhost"
  )
}

export function validateDesktopServer(value: unknown): DesktopServer {
  if (!value || typeof value !== "object") {
    throw new DesktopServerError(
      "invalid_server_metadata",
      "The desktop server metadata is unavailable.",
    )
  }

  const server = value as Partial<DesktopServer>
  for (const field of [
    "instanceId",
    "displayName",
    "issuer",
    "webOrigin",
    "apiOrigin",
    "serverVersion",
    "minimumDesktopVersion",
  ] as const) {
    if (typeof server[field] !== "string" || !server[field]?.trim()) {
      throw new DesktopServerError(
        "invalid_server_metadata",
        "The desktop server metadata is incomplete.",
      )
    }
  }

  if (server.protocolVersion !== 1 || server.issuer !== server.apiOrigin) {
    throw new DesktopServerError(
      "invalid_server_metadata",
      "The desktop server metadata is incompatible.",
    )
  }

  return server as DesktopServer
}

export function normalizeDesktopServerError(error: unknown) {
  if (error instanceof DesktopServerError) return error

  const failure =
    typeof error === "object" && error !== null
      ? (error as DesktopServerFailure)
      : null
  const code =
    typeof failure?.code === "string" ? failure.code : "server_verification_failed"
  const message =
    typeof failure?.message === "string"
      ? failure.message
      : "The Zilobase server could not be verified."

  return new DesktopServerError(code, message)
}
