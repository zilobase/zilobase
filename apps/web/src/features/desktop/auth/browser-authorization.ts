import { desktopBridge } from "@/platform/desktop/native"

import { isDesktopApp } from "../../../platform/environment"

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

export async function signInWithDesktopBrowser() {
  if (!isDesktopApp()) {
    throw new DesktopOAuthError(
      "desktop_required",
      "Browser authorization is only available in Zilobase Desktop.",
    )
  }

  try {
    await desktopBridge().auth.startBrowser()
    return "desktop" as const
  } catch (error) {
    throw normalizeDesktopOAuthError(error)
  }
}

export async function cancelDesktopBrowserSignIn() {
  if (!isDesktopApp()) return

  try {
    await desktopBridge().auth.cancelBrowser()
  } catch (error) {
    throw normalizeDesktopOAuthError(error)
  }
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
