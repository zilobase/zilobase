import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { apiFetch, ApiError } from "@/lib/api"
import { buildDesktopAuthDeepLink } from "@/lib/desktop-deep-link"
import { getAuthReturnPath } from "@/lib/google-auth"

export default function DesktopAuthPage() {
  const [deepLink, setDeepLink] = useState<string | null>(null)

  useEffect(() => {
    void completeDesktopSignIn().then(setDeepLink)
  }, [])

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="flex max-w-sm flex-col gap-4 text-center">
        <h1 className="text-lg font-semibold">Opening Zilobase</h1>
        <p className="text-sm text-muted-foreground">
          Your browser sign-in is complete. Return to the desktop app.
        </p>
        {deepLink && (
          <Button onClick={() => window.location.assign(deepLink)}>
            Open desktop app
          </Button>
        )}
      </div>
    </main>
  )
}

async function completeDesktopSignIn() {
  try {
    const { token } = await apiFetch<{ token: string }>(
      "/api/auth/one-time-token/generate",
      { method: "GET" },
    )
    const path = getAuthReturnPath("/dashboard")
    const deepLink = buildDesktopAuthDeepLink(token, path)
    window.location.assign(deepLink)
    return deepLink
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const returnTo = `${window.location.pathname}${window.location.search}`
      window.location.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`)
      return null
    }

    throw error
  }
}
