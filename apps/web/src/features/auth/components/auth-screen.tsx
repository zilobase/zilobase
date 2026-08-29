import type { ReactNode } from "react"
import { Link } from "@tanstack/react-router"

import { FieldDescription } from "@/shared/ui/field"
import { ZilobaseLogo } from "@/shared/components/zilobase-logo"

export function AuthScreen({
  children,
  switchLabel,
  switchSearch,
  switchTo,
  switchPrefix,
  title,
}: {
  children: ReactNode
  switchLabel: string
  switchPrefix: string
  switchSearch?: { invitation?: string; returnTo?: string }
  switchTo: "/login" | "/signup"
  title: string
}) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-surface-canvas p-6 md:p-10">
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

        {children}
      </div>
    </main>
  )
}
