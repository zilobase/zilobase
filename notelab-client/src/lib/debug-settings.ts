import { useCallback, useSyncExternalStore } from "react"

const TOOL_OUTPUT_UI_STORAGE_KEY = "notelab.debug.showToolOutputUi"
const GENERATIVE_TOOL_UI_STORAGE_KEY = "notelab.debug.showGenerativeToolUi"
const TOOL_OUTPUT_UI_EVENT = "notelab-debug-settings-change"

const isBrowser = typeof window !== "undefined"

export function getDefaultToolOutputUiEnabled() {
  return import.meta.env.DEV
}

export function getDefaultGenerativeToolUiEnabled() {
  return false
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

export function getGenerativeToolUiEnabled() {
  if (!isBrowser) {
    return getDefaultGenerativeToolUiEnabled()
  }

  const storedValue = window.localStorage.getItem(GENERATIVE_TOOL_UI_STORAGE_KEY)

  if (storedValue === null) {
    return getDefaultGenerativeToolUiEnabled()
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

export function setGenerativeToolUiEnabled(enabled: boolean) {
  if (!isBrowser) {
    return
  }

  window.localStorage.setItem(GENERATIVE_TOOL_UI_STORAGE_KEY, String(enabled))
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

export function useGenerativeToolUiEnabled() {
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
    getGenerativeToolUiEnabled,
    getDefaultGenerativeToolUiEnabled
  )
}

export function getRuntimeEnvironmentLabel() {
  return import.meta.env.DEV ? "Development" : "Production"
}
