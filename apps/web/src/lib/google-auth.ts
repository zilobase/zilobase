import { invoke, isTauri } from "@tauri-apps/api/core"

import { authFetch } from "@/lib/api"

const WEB_APP_URL = "https://app.zilobase.com"

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
  if (isTauri()) {
    try {
      await invoke("start_google_oauth")
      return "desktop" as const
    } catch (error) {
      throw normalizeDesktopOAuthError(error)
    }
  }

  const response = await authFetch<SocialSignInResponse>("/sign-in/social", {
    provider: "google",
    callbackURL: new URL(callbackURL, window.location.origin).toString(),
    errorCallbackURL: new URL(
      window.location.pathname,
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

export async function cancelDesktopGoogleSignIn() {
  if (!isTauri()) return

  try {
    await invoke("cancel_google_oauth")
  } catch (error) {
    throw normalizeDesktopOAuthError(error)
  }
}

export function getAuthReturnPath(
  fallback: string,
  search = window.location.search,
) {
  const returnTo = new URLSearchParams(search).get("returnTo")
  if (!returnTo?.startsWith("/") || returnTo.startsWith("//")) return fallback

  const url = new URL(returnTo, WEB_APP_URL)
  if (url.pathname === "/desktop-auth") return fallback

  return url.origin === WEB_APP_URL
    ? `${url.pathname}${url.search}${url.hash}`
    : fallback
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
      : "Desktop Google sign-in could not be completed."

  return new DesktopOAuthError(code, message)
}
