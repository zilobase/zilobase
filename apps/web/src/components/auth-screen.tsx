import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { isTauri } from "@tauri-apps/api/core"

import { FieldDescription } from "@/components/ui/field"
import { ZilobaseLogo } from "@/components/zilobase-logo"
import {
  getSelectedDesktopServer,
  isCloudDesktopServer,
} from "@/lib/desktop-server"

export function AuthScreen({
  children,
  showServerSwitch = true,
  switchLabel,
  switchSearch,
  switchTo,
  switchPrefix,
  title,
}: {
  children: ReactNode
  showServerSwitch?: boolean
  switchLabel: string
  switchPrefix: string
  switchSearch?: { invitation?: string; returnTo?: string }
  switchTo: "/login" | "/signup"
  title: string
}) {
  const desktop = isTauri()
  const server = getSelectedDesktopServer()

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2">
          <ZilobaseLogo className="h-7 w-auto" />
          <span className="font-medium">Zilobase</span>
        </div>

        <div>
          <h1 className="text-lg font-semibold">{title}</h1>
          <FieldDescription>
            {switchPrefix}{" "}
            <Link search={switchSearch} to={switchTo}>
              {switchLabel}
            </Link>
          </FieldDescription>
        </div>

        {desktop && showServerSwitch && server ? (
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="min-w-0 truncate text-muted-foreground">
              {isCloudDesktopServer(server)
                ? "Zilobase Cloud"
                : server.displayName}
            </p>
            <Link className="shrink-0 font-medium underline-offset-4 hover:underline" to="/connect">
              Change server
            </Link>
          </div>
        ) : null}

        {children}
      </div>
    </main>
  )
}
