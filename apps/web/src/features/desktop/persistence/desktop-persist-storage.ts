import { isDesktopApp } from "@/platform/desktop/native"
import { createJSONStorage, type StateStorage } from "zustand/middleware"

import { desktopPersistKey } from "../../../platform/server/desktop-server"

function createDesktopScopedStorage(): StateStorage {
  return {
    getItem: (name) => {
      if (typeof localStorage === "undefined") return null
      return localStorage.getItem(desktopPersistKey(name))
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
    skipHydration: typeof window !== "undefined" && isDesktopApp(),
    storage: createJSONStorage(() => createDesktopScopedStorage()),
  }
}

export function clearDesktopPersistKeys(instanceId: string) {
  if (typeof localStorage === "undefined") return
  for (const name of ["zilobase-app", "zilobase-auth-flow"]) {
    localStorage.removeItem(`${name}:${instanceId}`)
  }
}
