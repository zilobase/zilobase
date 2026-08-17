import { invoke, isTauri } from "@tauri-apps/api/core"
import packageJson from "../../package.json"
import { desktopNetworkFetch } from "@/lib/desktop-network"

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

export type PreparedDesktopServer = {
  candidateId: string
  server: DesktopServer
}

export type DesktopServerCommit = {
  changed: boolean
  server: DesktopServer
}

export type DesktopServerWorkspaceSnapshot = {
  id: string
  name: string
}

export type DesktopServerProfile = {
  active: boolean
  hasCredentials: boolean
  lastActiveWorkspaceId: string | null
  lastPath: string | null
  lastUsedAt: string | null
  server: DesktopServer
  workspaces: DesktopServerWorkspaceSnapshot[]
}

export type DesktopServerProfileList = {
  activeInstanceId: string
  profiles: DesktopServerProfile[]
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

const DEFAULT_DEV_API_ORIGIN = "http://localhost:3000"

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

export async function prepareDesktopServerCandidate(serverUrl: string) {
  if (!isTauri()) {
    throw new DesktopServerError(
      "desktop_required",
      "Custom desktop servers can only be selected in Zilobase Desktop.",
    )
  }

  try {
    const prepared = await invoke<PreparedDesktopServer>(
      "prepare_desktop_server_candidate",
      {
        serverUrl,
      },
    )
    if (!prepared || typeof prepared.candidateId !== "string") {
      throw new DesktopServerError(
        "invalid_server_metadata",
        "The verified server candidate is invalid.",
      )
    }
    return {
      candidateId: prepared.candidateId,
      server: validateDesktopServer(prepared.server),
    }
  } catch (error) {
    throw normalizeDesktopServerError(error)
  }
}

export async function discardDesktopServerCandidate(candidateId: string) {
  if (!isTauri()) return
  await invoke("discard_desktop_server_candidate", { candidateId })
}

export async function commitDesktopServerCandidate(candidateId: string) {
  if (!isTauri()) {
    throw new DesktopServerError(
      "desktop_required",
      "Custom desktop servers can only be selected in Zilobase Desktop.",
    )
  }

  try {
    const result = await invoke<DesktopServerCommit>(
      "commit_desktop_server_candidate",
      { candidateId },
    )
    selectedDesktopServer = validateDesktopServer(result.server)
    return { changed: result.changed === true, server: selectedDesktopServer }
  } catch (error) {
    throw normalizeDesktopServerError(error)
  }
}

export function getSelectedDesktopServer() {
  return selectedDesktopServer
}

export async function listDesktopServerProfiles(): Promise<DesktopServerProfileList> {
  if (!isTauri()) {
    return { activeInstanceId: "", profiles: [] }
  }

  try {
    const result = await invoke<DesktopServerProfileList>(
      "list_desktop_server_profiles",
    )
    return normalizeDesktopServerProfileList(result)
  } catch (error) {
    throw normalizeDesktopServerError(error)
  }
}

export async function switchDesktopServerProfile(input: {
  apiOrigin: string
  instanceId: string
  path?: string | null
  workspaceId?: string | null
}) {
  if (!isTauri()) {
    throw new DesktopServerError(
      "desktop_required",
      "Saved desktop servers can only be switched in Zilobase Desktop.",
    )
  }

  try {
    selectedDesktopServer = validateDesktopServer(
      await invoke<DesktopServer>("switch_desktop_server_profile", {
        apiOrigin: input.apiOrigin,
        instanceId: input.instanceId,
        path: input.path ?? null,
        workspaceId: input.workspaceId ?? null,
      }),
    )
    return selectedDesktopServer
  } catch (error) {
    throw normalizeDesktopServerError(error)
  }
}

export async function updateDesktopServerProfileSnapshot(input: {
  lastActiveWorkspaceId?: string | null
  lastPath?: string | null
  workspaces: DesktopServerWorkspaceSnapshot[]
}) {
  if (!isTauri()) return

  try {
    await invoke("update_desktop_server_profile_snapshot", {
      lastActiveWorkspaceId: input.lastActiveWorkspaceId ?? null,
      lastPath: input.lastPath ?? null,
      workspaces: input.workspaces,
    })
  } catch (error) {
    throw normalizeDesktopServerError(error)
  }
}

export async function removeDesktopServerProfile(input: {
  apiOrigin: string
  instanceId: string
}) {
  if (!isTauri()) {
    throw new DesktopServerError(
      "desktop_required",
      "Saved desktop servers can only be removed in Zilobase Desktop.",
    )
  }

  try {
    selectedDesktopServer = validateDesktopServer(
      await invoke<DesktopServer>("remove_desktop_server_profile", {
        apiOrigin: input.apiOrigin,
        instanceId: input.instanceId,
      }),
    )
    return selectedDesktopServer
  } catch (error) {
    throw normalizeDesktopServerError(error)
  }
}

export function desktopPersistKey(baseName: string, server = selectedDesktopServer) {
  return server ? `${baseName}:${server.instanceId}` : baseName
}

export function resolveDesktopServerSwitchPath(input: {
  hasCredentials?: boolean
  path?: string
}) {
  if (input.hasCredentials === false) return "/login"
  if (input.path) return input.path
  return "/recents"
}

export function applyActiveDesktopProfileWorkspace(
  profiles: DesktopServerProfileList | null | undefined,
  setActiveWorkspaceId: (workspaceId: string | null) => void,
) {
  const active = profiles?.profiles.find((profile) => profile.active)
  if (active?.lastActiveWorkspaceId) {
    setActiveWorkspaceId(active.lastActiveWorkspaceId)
  }
}

function normalizeDesktopServerProfileList(
  value: DesktopServerProfileList,
): DesktopServerProfileList {
  if (!value || !Array.isArray(value.profiles)) {
    throw new DesktopServerError(
      "invalid_server_metadata",
      "The saved desktop servers could not be loaded.",
    )
  }

  return {
    activeInstanceId:
      typeof value.activeInstanceId === "string" ? value.activeInstanceId : "",
    profiles: value.profiles.map((profile) => ({
      active: profile.active === true,
      hasCredentials: profile.hasCredentials === true,
      lastActiveWorkspaceId: profile.lastActiveWorkspaceId ?? null,
      lastPath: profile.lastPath ?? null,
      lastUsedAt: profile.lastUsedAt ?? null,
      server: validateDesktopServer(profile.server),
      workspaces: Array.isArray(profile.workspaces)
        ? profile.workspaces.flatMap((workspace) => {
            if (
              !workspace ||
              typeof workspace.id !== "string" ||
              typeof workspace.name !== "string" ||
              !workspace.id.trim() ||
              !workspace.name.trim()
            ) {
              return []
            }
            return [{ id: workspace.id, name: workspace.name }]
          })
        : [],
    })),
  }
}

export function desktopDevelopmentApiOrigin() {
  const configured = import.meta.env.VITE_API_URL?.replace(/\/$/, "")
  return configured && configured !== "/api" ? configured : DEFAULT_DEV_API_ORIGIN
}

export function desktopCloudConnectUrl(development = import.meta.env.DEV) {
  return development
    ? desktopDevelopmentApiOrigin()
    : CLOUD_DESKTOP_SERVER.apiOrigin
}

export function isDesktopDevelopmentServer(
  server: DesktopServer | null | undefined,
) {
  if (!server) return false
  const origin = desktopDevelopmentApiOrigin()
  const loopback = origin.replace("localhost", "127.0.0.1")
  return (
    server.instanceId === "zilobase-dev" ||
    server.apiOrigin === origin ||
    server.apiOrigin === loopback
  )
}

export function isCloudDesktopServer(
  server: DesktopServer | null | undefined,
  development = import.meta.env.DEV,
) {
  if (development) return isDesktopDevelopmentServer(server)
  return (
    server?.apiOrigin === CLOUD_DESKTOP_SERVER.apiOrigin &&
    server.issuer === CLOUD_DESKTOP_SERVER.issuer
  )
}

export function desktopServersReferToSameInstance(
  current: DesktopServer,
  candidate: DesktopServer,
) {
  if (
    current.instanceId === candidate.instanceId &&
    current.apiOrigin === candidate.apiOrigin &&
    current.issuer === candidate.issuer
  ) {
    return true
  }

  return (
    current.instanceId === CLOUD_DESKTOP_SERVER.instanceId &&
    current.apiOrigin === CLOUD_DESKTOP_SERVER.apiOrigin &&
    current.issuer === CLOUD_DESKTOP_SERVER.issuer &&
    candidate.apiOrigin === CLOUD_DESKTOP_SERVER.apiOrigin &&
    candidate.issuer === CLOUD_DESKTOP_SERVER.issuer
  )
}

export async function discoverRuntimeDesktopServer() {
  if (selectedDesktopServer) return selectedDesktopServer
  const apiOrigin = resolveRuntimeApiOrigin()
  const response = await desktopNetworkFetch(
    `${apiOrigin}/.well-known/zilobase`,
    { cache: "no-store", credentials: "omit" },
  )
  if (!response.ok) throw new Error("Zilobase discovery is unavailable.")
  return validateDesktopServer(await response.json())
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
  channel: "collaboration" | "meeting" | "realtime",
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
    channel === "realtime" ? urls.realtimeUrl : urls.collaborationUrl,
  )
  if (channel === "meeting") resolved.pathname = "/meeting-collaboration"
  resolved.search = configured.search
  return resolved.toString()
}

export function resolveRuntimeApiOrigin(
  location = typeof window !== "undefined" ? window.location : undefined,
  desktopServer = selectedDesktopServer,
) {
  // Tauri development uses Vite's http://localhost origin, so the window URL
  // alone cannot distinguish it from a normal browser. A selected native
  // server is authoritative in both development and packaged desktop builds.
  if (desktopServer) {
    return desktopServer.apiOrigin
  }

  if (isDesktopLocation(location)) {
    return CLOUD_DESKTOP_SERVER.apiOrigin
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

  if (
    server.protocolVersion !== 1 ||
    server.issuer !== server.apiOrigin ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(server.instanceId!) ||
    !isCanonicalDesktopOrigin(server.apiOrigin!) ||
    !isCanonicalDesktopOrigin(server.webOrigin!)
  ) {
    throw new DesktopServerError(
      "invalid_server_metadata",
      "The desktop server metadata is incompatible.",
    )
  }

  return server as DesktopServer
}

function isCanonicalDesktopOrigin(value: string) {
  try {
    const url = new URL(value)
    if (url.origin !== value || url.username || url.password) return false
    if (url.protocol === "https:") return true
    if (url.protocol !== "http:") return false
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "")
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1"
    )
  } catch {
    return false
  }
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
