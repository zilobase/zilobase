import { invoke, isDesktopApp } from "@/platform/desktop/native"
import {
  describeDesktopError,
  recordDesktopDiagnostic,
} from "../diagnostics/desktop-diagnostics"

let authToken: string | null = null
let authOwner: string | null = null

export async function initializeDesktopAuthToken() {
  if (!isDesktopApp()) return

  const startedAt = performance.now()
  recordDesktopDiagnostic("keyring.initialization", { status: "started" })
  try {
    await reloadDesktopAuthCredentials()
    recordDesktopDiagnostic("keyring.initialization", {
      duration_ms: performance.now() - startedAt,
      owner_present: Boolean(authOwner),
      status: "success",
      token_present: Boolean(authToken),
    })
  } catch (error) {
    authToken = null
    authOwner = null
    recordDesktopDiagnostic(
      "keyring.initialization",
      {
        ...describeDesktopError(error),
        duration_ms: performance.now() - startedAt,
      },
      "error",
    )
  }
}

export async function reloadDesktopAuthCredentials() {
  if (!isDesktopApp()) return

  ;[authToken, authOwner] = await Promise.all([
    invoke<string | null>("get_auth_token"),
    invoke<string | null>("get_auth_owner"),
  ])
}

export function getDesktopAuthToken() {
  return authToken
}

export function getDesktopAuthOwner() {
  return authOwner
}

export async function setDesktopAuthOwner(owner: string) {
  if (!isDesktopApp()) return
  authOwner = owner
  await invoke("set_auth_owner", { owner })
}

export async function setDesktopAuthToken(token: string) {
  if (!isDesktopApp()) return

  authToken = token
  await invoke("set_auth_token", { token })
}

export async function clearDesktopAuthToken() {
  if (!isDesktopApp()) return

  authToken = null
  authOwner = null
  await Promise.all([
    invoke("set_auth_token", { token: null }),
    invoke("set_auth_owner", { owner: null }),
  ])
}

export function forgetDesktopAuthCredentials() {
  authToken = null
  authOwner = null
}
