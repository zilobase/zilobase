import { useCallback, useSyncExternalStore } from "react"

const TOOL_OUTPUT_UI_STORAGE_KEY = "zilobase.debug.showToolOutputUi"
const TOOL_OUTPUT_UI_EVENT = "zilobase-debug-settings-change"

const isBrowser = typeof window !== "undefined"

export function getDefaultToolOutputUiEnabled() {
  return import.meta.env.DEV
}

export function getToolOutputUiEnabled() {
  if (!isBrowser) {
    return getDefaultToolOutputUiEnabled()
  }

  const storedValue = window.localStorage.getItem(TOOL_OUTPUT_UI_STORAGE_KEY)

  if (storedValue === null) {
    return getDefaultToolOutputUiEnabled()
  }

  return storedValue === "true"
}

export function setToolOutputUiEnabled(enabled: boolean) {
  if (!isBrowser) {
    return
  }

  window.localStorage.setItem(TOOL_OUTPUT_UI_STORAGE_KEY, String(enabled))
  window.dispatchEvent(new Event(TOOL_OUTPUT_UI_EVENT))
}

export function useToolOutputUiEnabled() {
  const subscribe = useCallback((onStoreChange: () => void) => {
    if (!isBrowser) {
      return () => undefined
    }

    window.addEventListener("storage", onStoreChange)
    window.addEventListener(TOOL_OUTPUT_UI_EVENT, onStoreChange)

    return () => {
      window.removeEventListener("storage", onStoreChange)
      window.removeEventListener(TOOL_OUTPUT_UI_EVENT, onStoreChange)
    }
  }, [])

  return useSyncExternalStore(
    subscribe,
    getToolOutputUiEnabled,
    getDefaultToolOutputUiEnabled
  )
}

export function getRuntimeEnvironmentLabel() {
  return import.meta.env.DEV ? "Development" : "Production"
}
