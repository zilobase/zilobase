"use client"

import { useEffect, useRef, useState } from "react"
import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
} from "@/components/ui/field"
import { ZilobaseLogo } from "@/components/zilobase-logo"
import { getApiErrorMessage } from "@/lib/api"
import { reloadDesktopAuthCredentials } from "@/lib/desktop-auth-token"
import {
  describeDesktopError,
  recordDesktopDiagnostic,
} from "@/lib/desktop-diagnostics"
import {
  getSelectedDesktopServer,
  isCloudDesktopServer,
} from "@/lib/desktop-server"
import {
  cancelDesktopBrowserSignIn,
  DesktopOAuthError,
  getAuthReturnPath,
  signInWithDesktopBrowser,
} from "@/lib/google-auth"
import { queryClient } from "@/lib/query-client"
import { webAuthClient } from "@/providers/features-provider"
import { sessionQueryOptions } from "@zilobase/features/auth"
import { workspacesQueryOptions } from "@zilobase/features/workspaces"

type BrowserSignInState =
  | { phase: "idle"; error: null; retry: "oauth" }
  | { phase: "waiting_for_browser"; error: null; retry: "oauth" }
  | { phase: "finalizing"; error: null; retry: "finalize" }
  | { phase: "error"; error: unknown; retry: "oauth" | "finalize" }

export function DesktopBrowserAuthScreen() {
  const server = getSelectedDesktopServer()
  const [browserState, setBrowserState] = useState<BrowserSignInState>({
    phase: "idle",
    error: null,
    retry: "oauth",
  })
  const browserOperation = useRef(0)
  const isPending =
    browserState.phase === "waiting_for_browser" ||
    browserState.phase === "finalizing"

  useEffect(
    () => () => {
      ++browserOperation.current
      void cancelDesktopBrowserSignIn().catch(() => undefined)
    },
    [],
  )

  async function handleBrowserSignIn() {
    const returnTo = getAuthReturnPath("/recents")
    const operation = ++browserOperation.current

    if (browserState.retry === "finalize") {
      await finalizeDesktopSignIn(operation, returnTo)
      return
    }

    setBrowserState({
      phase: "waiting_for_browser",
      error: null,
      retry: "oauth",
    })
    recordDesktopDiagnostic("desktop_auth.oauth", { status: "started" })

    try {
      await signInWithDesktopBrowser()
      if (operation === browserOperation.current) {
        await finalizeDesktopSignIn(operation, returnTo)
      }
    } catch (error) {
      if (operation !== browserOperation.current) return
      if (error instanceof DesktopOAuthError && error.code === "cancelled") {
        setBrowserState({ phase: "idle", error: null, retry: "oauth" })
        return
      }
      setBrowserState({ phase: "error", error, retry: "oauth" })
      recordDesktopDiagnostic(
        "desktop_auth.oauth",
        describeDesktopError(error),
        "error",
      )
    }
  }

  async function finalizeDesktopSignIn(operation: number, returnTo: string) {
    setBrowserState({ phase: "finalizing", error: null, retry: "finalize" })
    recordDesktopDiagnostic("desktop_auth.finalize", { status: "started" })

    try {
      await reloadDesktopAuthCredentials()
      const session = await queryClient.fetchQuery({
        ...sessionQueryOptions(webAuthClient),
        staleTime: 0,
      })
      if (!session.user || !session.session) {
        throw new Error("The desktop session could not be validated.")
      }
      const workspaces = await queryClient.fetchQuery({
        ...workspacesQueryOptions(webAuthClient),
        staleTime: 0,
      })
      if (operation !== browserOperation.current) return

      recordDesktopDiagnostic("desktop_auth.finalize", { status: "success" })
      setBrowserState({ phase: "idle", error: null, retry: "oauth" })
      window.location.assign(workspaces.length === 0 ? "/onboarding" : returnTo)
    } catch (error) {
      if (operation !== browserOperation.current) return
      setBrowserState({ phase: "error", error, retry: "finalize" })
      recordDesktopDiagnostic(
        "desktop_auth.finalize",
        describeDesktopError(error),
        "error",
      )
    }
  }

  async function handleCancelBrowserSignIn() {
    ++browserOperation.current
    setBrowserState({ phase: "idle", error: null, retry: "oauth" })
    try {
      await cancelDesktopBrowserSignIn()
    } catch (error) {
      setBrowserState({ phase: "error", error, retry: "oauth" })
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2">
          <ZilobaseLogo className="h-7 w-auto" />
          <span className="font-medium">Zilobase</span>
        </div>

        <div>
          <h1 className="text-lg font-semibold">Continue in your browser</h1>
          <FieldDescription>
            Sign in or create an account in the browser. The desktop app keeps
            its own session.
          </FieldDescription>
        </div>

        {server ? (
          <div className="flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">
                {isCloudDesktopServer(server)
                  ? "Zilobase Cloud"
                  : server.displayName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {server.apiOrigin}
              </p>
            </div>
            <Link
              className="shrink-0 font-medium underline-offset-4 hover:underline"
              to="/connect"
            >
              Change server
            </Link>
          </div>
        ) : (
          <Link
            className="text-sm font-medium underline-offset-4 hover:underline"
            to="/connect"
          >
            Change server
          </Link>
        )}

        <FieldGroup>
          {browserState.phase === "error" ? (
            <FieldError>{getApiErrorMessage(browserState.error)}</FieldError>
          ) : null}
          <Field>
            <Button
              disabled={isPending}
              onClick={() => void handleBrowserSignIn()}
              type="button"
            >
              {browserState.phase === "waiting_for_browser"
                ? "Waiting for browser sign-in..."
                : browserState.phase === "finalizing"
                  ? "Finishing sign-in..."
                  : browserState.retry === "finalize"
                    ? "Retry connection"
                    : "Continue in Browser"}
            </Button>
            {browserState.phase === "waiting_for_browser" ? (
              <Button
                onClick={() => void handleCancelBrowserSignIn()}
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
            ) : null}
          </Field>
        </FieldGroup>
      </div>
    </main>
  )
}
