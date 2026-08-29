import { authFetch } from "@/lib/api"

const CLOUD_API_URL = "https://api.zilobase.com"

type SocialSignInResponse = {
  redirect: boolean
  url?: string
}

export async function signInWithGoogle(
  callbackURL: string,
  invitationId?: string | null,
) {
  const response = await authFetch<SocialSignInResponse>("/sign-in/social", {
    provider: "google",
    callbackURL: new URL(callbackURL, window.location.origin).toString(),
    errorCallbackURL: new URL(
      `${window.location.pathname}${window.location.search}`,
      window.location.origin,
    ).toString(),
    disableRedirect: true,
    ...(invitationId ? { invitationId } : {}),
  })

  if (!response.url) {
    throw new Error("Google sign-in is unavailable.")
  }

  window.location.assign(response.url)
  return "web" as const
}

export function getAuthReturnPath(
  fallback: string,
  search = window.location.search,
) {
  const returnTo = new URLSearchParams(search).get("returnTo")
  if (!returnTo) return fallback

  const isRelative = returnTo.startsWith("/") && !returnTo.startsWith("//")
  const currentOrigin =
    typeof window === "undefined"
      ? "https://app.zilobase.com"
      : window.location.origin

  let url: URL
  try {
    url = new URL(returnTo, currentOrigin)
  } catch {
    return fallback
  }

  if (url.pathname === "/desktop-auth") return fallback

  if (isRelative && url.origin === currentOrigin) {
    return `${url.pathname}${url.search}${url.hash}`
  }

  if (
    url.pathname === "/desktop/authorize" &&
    !url.username &&
    !url.password &&
    !url.hash &&
    allowedBrowserAuthorizationOrigins().has(url.origin)
  ) {
    return url.toString()
  }

  return fallback
}

export function getInvitationAuthSearch(search = window.location.search) {
  const parameters = new URLSearchParams(search)
  const directInvitation = readSingleNonEmpty(parameters, "invitation")
  const safeReturnTo = getAuthReturnPath("/recents", search)

  if (directInvitation) {
    const requestedReturnTo = readInvitationReturnTo(
      safeReturnTo,
      directInvitation,
    )
    const returnTo =
      requestedReturnTo ??
      `/accept-invitation?id=${encodeURIComponent(directInvitation)}`
    return {
      invitation: directInvitation,
      returnTo,
    }
  }

  try {
    const url = new URL(safeReturnTo, window.location.origin)
    const invitation = readSingleNonEmpty(url.searchParams, "id")

    if (
      url.origin === window.location.origin &&
      isInvitationAcceptancePath(url.pathname) &&
      invitation
    ) {
      return { invitation, returnTo: `${url.pathname}${url.search}` }
    }
  } catch {
    // Fall through to a normal signup link.
  }

  return {}
}

function readInvitationReturnTo(returnTo: string, invitationId: string) {
  try {
    const url = new URL(returnTo, window.location.origin)
    return url.origin === window.location.origin &&
      isInvitationAcceptancePath(url.pathname) &&
      readSingleNonEmpty(url.searchParams, "id") === invitationId
      ? `${url.pathname}${url.search}`
      : null
  } catch {
    return null
  }
}

function isInvitationAcceptancePath(pathname: string) {
  return (
    pathname === "/accept-invitation" ||
    pathname === "/accept-page-invitation"
  )
}

function readSingleNonEmpty(parameters: URLSearchParams, key: string) {
  const values = parameters.getAll(key)
  const value = values[0]?.trim()
  return values.length === 1 && value ? value : null
}

function allowedBrowserAuthorizationOrigins() {
  const currentOrigin =
    typeof window === "undefined"
      ? "https://app.zilobase.com"
      : window.location.origin
  const origins = new Set([currentOrigin, CLOUD_API_URL])
  const configured = import.meta.env.VITE_API_URL

  if (configured) {
    try {
      addLoopbackOriginAliases(
        origins,
        new URL(configured, currentOrigin).origin,
      )
    } catch {
      // Invalid build-time values are ignored instead of creating an open redirect.
    }
  }

  return origins
}

function addLoopbackOriginAliases(origins: Set<string>, origin: string) {
  origins.add(origin)
  try {
    const url = new URL(origin)
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return
    for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) {
      url.hostname = hostname
      origins.add(url.origin)
    }
  } catch {
    // Ignore unparseable origins.
  }
}
