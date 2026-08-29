import * as React from "react"

import {
  isThemeFamilyId,
  THEME_FAMILY_STORAGE_KEY,
  type ThemeFamilyId,
} from "@/shared/lib/themes"

type ThemeFamilyContextValue = {
  themeFamily: ThemeFamilyId
  setThemeFamily: (theme: ThemeFamilyId) => void
}

const ThemeFamilyContext = React.createContext<ThemeFamilyContextValue | null>(
  null,
)

function readStoredThemeFamily(): ThemeFamilyId {
  if (typeof window === "undefined") return "default"

  try {
    const storedFamily = window.localStorage.getItem(THEME_FAMILY_STORAGE_KEY)
    if (isThemeFamilyId(storedFamily)) return storedFamily

    // Migrate the previous model where custom palettes were stored as modes.
    const legacyTheme = window.localStorage.getItem("theme")
    return isThemeFamilyId(legacyTheme) && legacyTheme !== "default"
      ? legacyTheme
      : "default"
  } catch {
    return "default"
  }
}

function applyThemeFamily(themeFamily: ThemeFamilyId) {
  document.documentElement.dataset.theme = themeFamily
  try {
    window.localStorage.setItem(THEME_FAMILY_STORAGE_KEY, themeFamily)
  } catch {
    // The active document can still use the palette when storage is unavailable.
  }
}

export function ThemeFamilyProvider({ children }: React.PropsWithChildren) {
  const [themeFamily, setThemeFamilyState] = React.useState(readStoredThemeFamily)

  React.useEffect(() => {
    applyThemeFamily(themeFamily)
  }, [themeFamily])

  const setThemeFamily = React.useCallback((nextTheme: ThemeFamilyId) => {
    applyThemeFamily(nextTheme)
    setThemeFamilyState(nextTheme)
  }, [])

  return (
    <ThemeFamilyContext.Provider value={{ themeFamily, setThemeFamily }}>
      {children}
    </ThemeFamilyContext.Provider>
  )
}

export function useThemeFamily() {
  const context = React.useContext(ThemeFamilyContext)

  if (!context) {
    throw new Error("useThemeFamily must be used within ThemeFamilyProvider")
  }

  return context
}
