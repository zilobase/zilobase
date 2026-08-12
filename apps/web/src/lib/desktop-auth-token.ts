import { invoke, isTauri } from "@tauri-apps/api/core"

let authToken: string | null = null
let authOwner: string | null = null

export async function initializeDesktopAuthToken() {
  if (!isTauri()) return

  try {
    ;[authToken, authOwner] = await Promise.all([
      invoke<string | null>("get_auth_token"),
      invoke<string | null>("get_auth_owner"),
    ])
  } catch {
    authToken = null
    authOwner = null
  }
}

export function getDesktopAuthToken() {
  return authToken
}

export function getDesktopAuthOwner() {
  return authOwner
}

export async function setDesktopAuthOwner(owner: string) {
  if (!isTauri()) return
  authOwner = owner
  await invoke("set_auth_owner", { owner })
}

export async function setDesktopAuthToken(token: string) {
  if (!isTauri()) return

  authToken = token
  await invoke("set_auth_token", { token })
}

export async function clearDesktopAuthToken() {
  if (!isTauri()) return

  authToken = null
  authOwner = null
  await Promise.all([
    invoke("set_auth_token", { token: null }),
    invoke("set_auth_owner", { owner: null }),
  ])
}
