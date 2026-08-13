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
import {
  describeDesktopError,
  recordDesktopDiagnostic,
} from "@/lib/desktop-diagnostics"
import { getAuthReturnPath, signInWithGoogle } from "@/lib/google-auth"
import { cn } from "@/lib/utils"
import { useSignInWithPassword } from "@zilobase/features/auth"

const DESKTOP_AUTH_WAIT_TIMEOUT_MS = 120_000

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const signInWithPassword = useSignInWithPassword()
  const [showPassword, setShowPassword] = useState(false)
  const [googleError, setGoogleError] = useState<unknown>(null)
  const [isGooglePending, setIsGooglePending] = useState(false)
  const googlePendingTimer = useRef<number | undefined>(undefined)
  const isPending = signInWithPassword.isPending || isGooglePending
  const desktopAuthFailed = new URLSearchParams(window.location.search).has(
    "desktopAuthError",
  )

  useEffect(() => {
    if (!isTauri()) return

    const resetGooglePending = () => {
      if (googlePendingTimer.current === undefined) return
      window.clearTimeout(googlePendingTimer.current)
      googlePendingTimer.current = undefined
      setIsGooglePending(false)
      recordDesktopDiagnostic("desktop_auth.browser_return", {
        status: "success",
      })
    }

    window.addEventListener("focus", resetGooglePending)
    return () => {
      window.removeEventListener("focus", resetGooglePending)
      window.clearTimeout(googlePendingTimer.current)
    }
  }, [])

  async function handleGoogleSignIn() {
    setGoogleError(null)
    setIsGooglePending(true)
    const desktop = isTauri()

    if (desktop) {
      recordDesktopDiagnostic("desktop_auth.browser_open", {
        status: "started",
      })
      window.clearTimeout(googlePendingTimer.current)
      googlePendingTimer.current = window.setTimeout(() => {
        googlePendingTimer.current = undefined
        setIsGooglePending(false)
        recordDesktopDiagnostic(
          "desktop_auth.browser_return",
          { status: "timeout" },
          "warn",
        )
      }, DESKTOP_AUTH_WAIT_TIMEOUT_MS)
    }

    try {
      await signInWithGoogle(getAuthReturnPath("/dashboard"))
      if (desktop) {
        recordDesktopDiagnostic("desktop_auth.browser_open", {
          status: "success",
        })
      }
    } catch (error) {
      window.clearTimeout(googlePendingTimer.current)
      googlePendingTimer.current = undefined
      setGoogleError(error)
      setIsGooglePending(false)
      recordDesktopDiagnostic(
        "desktop_auth.browser_open",
        describeDesktopError(error),
        "error",
      )
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

          {(signInWithPassword.isError || googleError !== null || desktopAuthFailed) && (
            <FieldError>
              {desktopAuthFailed
                ? "Desktop sign-in could not be completed. Try again."
                : getApiErrorMessage(signInWithPassword.error ?? googleError)}
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
              {isGooglePending
                ? "Waiting for browser sign-in..."
                : "Continue with Google"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </div>
  )
}
