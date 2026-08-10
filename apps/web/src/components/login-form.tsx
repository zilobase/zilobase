"use client"

import { useState } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
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
import { signInWithGoogle } from "@/lib/google-auth"
import { cn } from "@/lib/utils"
import { useSignInWithPassword } from "@zilobase/features/auth"

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const navigate = useNavigate()
  const signInWithPassword = useSignInWithPassword()
  const [showPassword, setShowPassword] = useState(false)
  const [googleError, setGoogleError] = useState<unknown>(null)
  const [isGooglePending, setIsGooglePending] = useState(false)
  const isPending = signInWithPassword.isPending || isGooglePending

  async function handleGoogleSignIn() {
    setGoogleError(null)
    setIsGooglePending(true)

    try {
      await signInWithGoogle("/dashboard")
    } catch (error) {
      setGoogleError(error)
      setIsGooglePending(false)
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const email = String(formData.get("email") ?? "").trim().toLowerCase()
    const password = String(formData.get("password") ?? "")
    const returnTo = new URLSearchParams(window.location.search).get("returnTo")

    try {
      await signInWithPassword.mutateAsync({ email, password })
      if (returnTo) {
        window.location.assign(returnTo)
      } else {
        void navigate({ to: "/dashboard" })
      }
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

          {(signInWithPassword.isError || googleError !== null) && (
            <FieldError>
              {getApiErrorMessage(signInWithPassword.error ?? googleError)}
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
              {isGooglePending ? "Opening Google..." : "Continue with Google"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </div>
  )
}
