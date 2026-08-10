import { authFetch } from "@/lib/api"

type SocialSignInResponse = {
  redirect: boolean
  url?: string
}

export async function signInWithGoogle(callbackURL: string) {
  const response = await authFetch<SocialSignInResponse>("/sign-in/social", {
    provider: "google",
    callbackURL,
    disableRedirect: true,
  })

  if (!response.url) {
    throw new Error("Google sign-in is unavailable.")
  }

  window.location.assign(response.url)
}
