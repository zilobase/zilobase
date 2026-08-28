import * as React from "react"
import { IconContext } from "@phosphor-icons/react"

const appIconDefaults = {
  weight: "bold",
} as const

export function AppIconProvider({ children }: React.PropsWithChildren) {
  return (
    <IconContext.Provider value={appIconDefaults}>
      {children}
    </IconContext.Provider>
  )
}
