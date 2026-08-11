import { isTauri } from "@tauri-apps/api/core"
import { openUrl } from "@tauri-apps/plugin-opener"

import { authFetch } from "@/lib/api"

const WEB_APP_URL = "https://app.zilobase.com"

type SocialSignInResponse = {
  redirect: boolean
  url?: string
}

export async function signInWithGoogle(callbackURL: string) {
  if (isTauri()) {
    const url = new URL(
      "/desktop-auth",
      import.meta.env.DEV ? window.location.origin : WEB_APP_URL,
    )
    url.searchParams.set("path", callbackURL)
    await openUrl(url.toString())
    return
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
}

export function getAuthReturnPath(
  fallback: string,
  search = window.location.search,
) {
  const returnTo = new URLSearchParams(search).get("returnTo")
  if (!returnTo?.startsWith("/") || returnTo.startsWith("//")) return fallback

  const url = new URL(returnTo, WEB_APP_URL)
  return url.origin === WEB_APP_URL
    ? `${url.pathname}${url.search}${url.hash}`
    : fallback
}
