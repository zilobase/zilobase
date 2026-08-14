import { invoke, isTauri } from "@tauri-apps/api/core"

import { authFetch } from "@/lib/api"

const CLOUD_API_URL = "https://api.zilobase.com"

type SocialSignInResponse = {
  redirect: boolean
  url?: string
}

type DesktopOAuthFailure = {
  code?: unknown
  message?: unknown
}

export class DesktopOAuthError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "DesktopOAuthError"
    this.code = code
  }
}

export async function signInWithGoogle(callbackURL: string) {
  const response = await authFetch<SocialSignInResponse>("/sign-in/social", {
    provider: "google",
    callbackURL: new URL(callbackURL, window.location.origin).toString(),
    errorCallbackURL: new URL(
      `${window.location.pathname}${window.location.search}`,
      window.location.origin,
    ).toString(),
    disableRedirect: true,
  })

  if (!response.url) {
    throw new Error("Google sign-in is unavailable.")
  }

  window.location.assign(response.url)
  return "web" as const
}

export async function signInWithDesktopBrowser() {
  if (!isTauri()) {
    throw new DesktopOAuthError(
      "desktop_required",
      "Browser authorization is only available in Zilobase Desktop.",
    )
  }

  try {
    await invoke("start_browser_authorization")
    return "desktop" as const
  } catch (error) {
    throw normalizeDesktopOAuthError(error)
  }
}

export async function cancelDesktopBrowserSignIn() {
  if (!isTauri()) return

  try {
    await invoke("cancel_browser_authorization")
  } catch (error) {
    throw normalizeDesktopOAuthError(error)
  }
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

function allowedBrowserAuthorizationOrigins() {
  const currentOrigin =
    typeof window === "undefined"
      ? "https://app.zilobase.com"
      : window.location.origin
  const origins = new Set([currentOrigin, CLOUD_API_URL])
  const configured = import.meta.env.VITE_API_URL

  if (configured) {
    try {
      origins.add(new URL(configured, currentOrigin).origin)
    } catch {
      // Invalid build-time values are ignored instead of creating an open redirect.
    }
  }

  return origins
}

function normalizeDesktopOAuthError(error: unknown) {
  const failure =
    typeof error === "object" && error !== null
      ? (error as DesktopOAuthFailure)
      : null
  const code =
    typeof failure?.code === "string" ? failure.code : "desktop_oauth_failed"
  const message =
    typeof failure?.message === "string"
      ? failure.message
      : "Desktop browser sign-in could not be completed."

  return new DesktopOAuthError(code, message)
}
