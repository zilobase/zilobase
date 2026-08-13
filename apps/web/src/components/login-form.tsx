"use client"

import { useEffect, useRef, useState } from "react"
import { Link } from "@tanstack/react-router"
import { isTauri } from "@tauri-apps/api/core"
import { EyeIcon, EyeOffIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { GoogleIcon } from "@/components/google-icon"
import { ZilobaseLogo } from "@/components/zilobase-logo"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Input } from "@/components/ui/input"
import { getApiErrorMessage } from "@/lib/api"
import { reloadDesktopAuthCredentials } from "@/lib/desktop-auth-token"
import {
  describeDesktopError,
  recordDesktopDiagnostic,
} from "@/lib/desktop-diagnostics"
import {
  cancelDesktopGoogleSignIn,
  DesktopOAuthError,
  getAuthReturnPath,
  signInWithGoogle,
} from "@/lib/google-auth"
import { queryClient } from "@/lib/query-client"
import { cn } from "@/lib/utils"
import { webAuthClient } from "@/providers/features-provider"
import {
  sessionQueryOptions,
  useSignInWithPassword,
} from "@zilobase/features/auth"
import { workspacesQueryOptions } from "@zilobase/features/workspaces"

type GoogleSignInState =
  | { phase: "idle"; error: null; retry: "oauth" }
  | { phase: "waiting_for_browser"; error: null; retry: "oauth" }
  | { phase: "finalizing"; error: null; retry: "finalize" }
  | { phase: "error"; error: unknown; retry: "oauth" | "finalize" }

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const signInWithPassword = useSignInWithPassword()
  const [showPassword, setShowPassword] = useState(false)
  const [googleState, setGoogleState] = useState<GoogleSignInState>({
    phase: "idle",
    error: null,
    retry: "oauth",
  })
  const googleOperation = useRef(0)
  const isGooglePending =
    googleState.phase === "waiting_for_browser" ||
    googleState.phase === "finalizing"
  const isPending = signInWithPassword.isPending || isGooglePending

  useEffect(
    () => () => {
      ++googleOperation.current
      void cancelDesktopGoogleSignIn().catch(() => undefined)
    },
    [],
  )

  async function handleGoogleSignIn() {
    const desktop = isTauri()
    const returnTo = getAuthReturnPath("/dashboard")
    const operation = ++googleOperation.current

    if (desktop && googleState.retry === "finalize") {
      await finalizeDesktopSignIn(operation, returnTo)
      return
    }

    setGoogleState({ phase: "waiting_for_browser", error: null, retry: "oauth" })
    recordDesktopDiagnostic("desktop_auth.oauth", { status: "started" })

    try {
      const mode = await signInWithGoogle(returnTo)
      if (mode === "desktop" && operation === googleOperation.current) {
        await finalizeDesktopSignIn(operation, returnTo)
      }
    } catch (error) {
      if (operation !== googleOperation.current) return
      if (error instanceof DesktopOAuthError && error.code === "cancelled") {
        setGoogleState({ phase: "idle", error: null, retry: "oauth" })
        return
      }
      setGoogleState({ phase: "error", error, retry: "oauth" })
      recordDesktopDiagnostic(
        "desktop_auth.oauth",
        describeDesktopError(error),
        "error",
      )
    }
  }

  async function finalizeDesktopSignIn(operation: number, returnTo: string) {
    setGoogleState({ phase: "finalizing", error: null, retry: "finalize" })
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
      if (operation !== googleOperation.current) return

      recordDesktopDiagnostic("desktop_auth.finalize", { status: "success" })
      setGoogleState({ phase: "idle", error: null, retry: "oauth" })
      window.location.assign(workspaces.length === 0 ? "/onboarding" : returnTo)
    } catch (error) {
      if (operation !== googleOperation.current) return
      setGoogleState({ phase: "error", error, retry: "finalize" })
      recordDesktopDiagnostic(
        "desktop_auth.finalize",
        describeDesktopError(error),
        "error",
      )
    }
  }

  async function handleCancelGoogleSignIn() {
    ++googleOperation.current
    setGoogleState({ phase: "idle", error: null, retry: "oauth" })
    try {
      await cancelDesktopGoogleSignIn()
    } catch (error) {
      setGoogleState({ phase: "error", error, retry: "oauth" })
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get("email") ?? "").trim().toLowerCase()
    const password = String(formData.get("password") ?? "")
    const returnTo = getAuthReturnPath("/dashboard")

    try {
      await signInWithPassword.mutateAsync({ email, password })
      window.location.assign(returnTo)
    } catch {
      // React Query owns the visible error state.
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <div className="flex items-center gap-2">
        <ZilobaseLogo className="h-7 w-auto" />
        <span className="font-medium">Zilobase</span>
      </div>

      <div>
        <h1 className="text-lg font-semibold">Sign in to your account</h1>
        <FieldDescription>
          Don&apos;t have an account? <Link to="/signup">Sign up</Link>
        </FieldDescription>
      </div>

      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              disabled={isPending}
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                disabled={isPending}
                required
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                  size="icon-xs"
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </Field>

          {(signInWithPassword.isError || googleState.phase === "error") && (
            <FieldError>
              {getApiErrorMessage(
                signInWithPassword.error ??
                  (googleState.phase === "error" ? googleState.error : null),
              )}
            </FieldError>
          )}

          <Field>
            <Button type="submit" disabled={isPending}>
              {signInWithPassword.isPending ? "Signing in..." : "Sign in"}
            </Button>
          </Field>

          <FieldSeparator>Or</FieldSeparator>

          <Field>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={handleGoogleSignIn}
            >
              <GoogleIcon />
              {googleState.phase === "waiting_for_browser"
                ? "Waiting for browser sign-in..."
                : googleState.phase === "finalizing"
                  ? "Finishing sign-in..."
                  : googleState.retry === "finalize"
                    ? "Retry connection"
                    : "Continue with Google"}
            </Button>
            {googleState.phase === "waiting_for_browser" && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleCancelGoogleSignIn}
              >
                Cancel
              </Button>
            )}
          </Field>
        </FieldGroup>
      </form>
    </div>
  )
}
