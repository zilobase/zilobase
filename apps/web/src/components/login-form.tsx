"use client"

import { useEffect, useRef, useState } from "react"
import { Link } from "@tanstack/react-router"
import { isTauri } from "@tauri-apps/api/core"
import { EyeIcon, EyeOffIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { GoogleIcon } from "@/components/google-icon"
import { ZilobaseLogo } from "@/components/zilobase-logo"
import { DesktopServerSelector } from "@/components/desktop-server-selector"
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
  cancelDesktopBrowserSignIn,
  DesktopOAuthError,
  getAuthReturnPath,
  getInvitationAuthSearch,
  signInWithDesktopBrowser,
  signInWithGoogle,
} from "@/lib/google-auth"
import { queryClient } from "@/lib/query-client"
import { cn } from "@/lib/utils"
import { webAuthClient } from "@/providers/features-provider"
import {
  sessionQueryOptions,
  useRequestSignInOtp,
  useSignInWithPassword,
} from "@zilobase/features/auth"
import { workspacesQueryOptions } from "@zilobase/features/workspaces"
import { useAuthFlowStore } from "@/stores/auth-flow-store"

type BrowserSignInState =
  | { phase: "idle"; error: null; retry: "oauth" }
  | { phase: "waiting_for_browser"; error: null; retry: "oauth" }
  | { phase: "finalizing"; error: null; retry: "finalize" }
  | { phase: "error"; error: unknown; retry: "oauth" | "finalize" }

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const signInWithPassword = useSignInWithPassword()
  const requestSignInOtp = useRequestSignInOtp()
  const setAuthFlow = useAuthFlowStore((state) => state.setAuthFlow)
  const [email, setEmail] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [browserState, setBrowserState] = useState<BrowserSignInState>({
    phase: "idle",
    error: null,
    retry: "oauth",
  })
  const browserOperation = useRef(0)
  const isBrowserPending =
    browserState.phase === "waiting_for_browser" ||
    browserState.phase === "finalizing"
  const isPending =
    signInWithPassword.isPending ||
    requestSignInOtp.isPending ||
    isBrowserPending
  const desktop = isTauri()
  const signupSearch = getInvitationAuthSearch()

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

    if (desktop && browserState.retry === "finalize") {
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
      const mode = desktop
        ? await signInWithDesktopBrowser()
        : await signInWithGoogle(returnTo)
      if (mode === "desktop" && operation === browserOperation.current) {
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const submittedEmail = String(formData.get("email") ?? "")
      .trim()
      .toLowerCase()
    const password = String(formData.get("password") ?? "")
    const returnTo = getAuthReturnPath("/recents")

    try {
      await signInWithPassword.mutateAsync({
        email: submittedEmail,
        password,
      })
      window.location.assign(returnTo)
    } catch {
      // React Query owns the visible error state.
    }
  }

  async function handleEmailOtpSignIn() {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) return

    try {
      await requestSignInOtp.mutateAsync(normalizedEmail)
      setAuthFlow({
        email: normalizedEmail,
        purpose: "sign-in",
        returnTo: getAuthReturnPath("/recents"),
      })
      window.location.assign("/otp")
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
          Don&apos;t have an account?{" "}
          <Link to="/signup" search={signupSearch}>
            Sign up
          </Link>
        </FieldDescription>
      </div>

      {desktop && (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <DesktopServerSelector actionLabel="Use another server" />
        </div>
      )}

      {desktop && (
        <div className="space-y-3">
          <Button
            disabled={isPending}
            onClick={handleBrowserSignIn}
            type="button"
          >
            {browserState.phase === "waiting_for_browser"
              ? "Waiting for browser sign-in..."
              : browserState.phase === "finalizing"
                ? "Finishing sign-in..."
                : browserState.retry === "finalize"
                  ? "Retry connection"
                  : "Continue in system browser"}
          </Button>
          {browserState.phase === "waiting_for_browser" && (
            <Button
              onClick={handleCancelBrowserSignIn}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
          )}
          {browserState.phase === "error" && (
            <FieldError>{getApiErrorMessage(browserState.error)}</FieldError>
          )}
          <FieldDescription>
            Sign in with this server&apos;s password, email code, Google, or
            configured SSO provider in your browser.
          </FieldDescription>
        </div>
      )}

      {!desktop && (
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
                onChange={(event) => setEmail(event.target.value)}
                required
                value={email}
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
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((visible) => !visible)}
                    size="icon-xs"
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </Field>

            {(signInWithPassword.isError ||
              requestSignInOtp.isError ||
              browserState.phase === "error") && (
              <FieldError>
                {getApiErrorMessage(
                  signInWithPassword.error ??
                    requestSignInOtp.error ??
                    (browserState.phase === "error"
                      ? browserState.error
                      : null),
                )}
              </FieldError>
            )}

            <Field>
              <Button type="submit" disabled={isPending}>
                {signInWithPassword.isPending ? "Signing in..." : "Sign in"}
              </Button>
              <Button
                disabled={isPending || !email.trim()}
                onClick={handleEmailOtpSignIn}
                type="button"
                variant="outline"
              >
                {requestSignInOtp.isPending
                  ? "Sending code..."
                  : "Email me a sign-in code"}
              </Button>
            </Field>

            <FieldSeparator>Or</FieldSeparator>

            <Field>
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={handleBrowserSignIn}
              >
                <GoogleIcon />
                {browserState.phase === "waiting_for_browser"
                  ? "Waiting for browser sign-in..."
                  : browserState.phase === "finalizing"
                    ? "Finishing sign-in..."
                    : browserState.retry === "finalize"
                      ? "Retry connection"
                      : "Continue with Google"}
              </Button>
              {browserState.phase === "waiting_for_browser" && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleCancelBrowserSignIn}
                >
                  Cancel
                </Button>
              )}
            </Field>
          </FieldGroup>
        </form>
      )}
    </div>
  )
}
