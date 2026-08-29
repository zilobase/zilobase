import { isTauri } from "@tauri-apps/api/core"
import { createJSONStorage, type StateStorage } from "zustand/middleware"

import { desktopPersistKey } from "../server/desktop-server"

function createDesktopScopedStorage(): StateStorage {
  return {
    getItem: (name) => {
      if (typeof localStorage === "undefined") return null
      const scoped = desktopPersistKey(name)
      const current = localStorage.getItem(scoped)
      if (current != null) return current
      if (scoped === name) return null
      const legacy = localStorage.getItem(name)
      if (legacy != null) {
        localStorage.setItem(scoped, legacy)
        return legacy
      }
      return null
    },
    removeItem: (name) => {
      if (typeof localStorage === "undefined") return
      localStorage.removeItem(desktopPersistKey(name))
    },
    setItem: (name, value) => {
      if (typeof localStorage === "undefined") return
      localStorage.setItem(desktopPersistKey(name), value)
    },
  }
}

export function desktopPersistOptions(name: string) {
  return {
    name,
    skipHydration: typeof window !== "undefined" && isTauri(),
    storage: createJSONStorage(() => createDesktopScopedStorage()),
  }
}

export function clearDesktopPersistKeys(instanceId: string) {
  if (typeof localStorage === "undefined") return
  for (const name of ["zilobase-app", "zilobase-auth-flow"]) {
    localStorage.removeItem(`${name}:${instanceId}`)
  }
}
