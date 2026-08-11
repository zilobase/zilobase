import { invoke, isTauri } from "@tauri-apps/api/core"

let authToken: string | null = null

export async function initializeDesktopAuthToken() {
  if (!isTauri()) return

  try {
    authToken = await invoke<string | null>("get_auth_token")
  } catch {
    authToken = null
  }
}

export function getDesktopAuthToken() {
  return authToken
}

export async function setDesktopAuthToken(token: string) {
  if (!isTauri()) return

  authToken = token
  await invoke("set_auth_token", { token })
}

export async function clearDesktopAuthToken() {
  if (!isTauri()) return

  authToken = null
  await invoke("set_auth_token", { token: null })
}
