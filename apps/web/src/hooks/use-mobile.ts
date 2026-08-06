import * as React from "react"

export const MOBILE_BREAKPOINT = 768

export function isMobileViewport() {
  return typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(isMobileViewport())
    }
    mql.addEventListener("change", onChange)
    setIsMobile(isMobileViewport())
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
