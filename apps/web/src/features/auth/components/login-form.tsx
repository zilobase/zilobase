"use client"

import { useState } from "react"
import { EyeIcon, EyeOffIcon } from "@/shared/components/icons"

import { Button } from "@/shared/ui/button"
import { GoogleIcon } from "@/shared/components/google-icon"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/shared/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/shared/ui/input-group"
import { Input } from "@/shared/ui/input"
import { getApiErrorMessage } from "@/features/desktop/network/api"
import { getAuthReturnPath, signInWithGoogle } from "../lib/google-auth"
import { cn } from "@/shared/lib/utils"
import {
  useRequestSignInOtp,
  useSignInWithPassword,
} from "@zilobase/features/auth"
import { useAuthFlowStore } from "../state/auth-flow-store"
import { editionWebModule } from "@zilobase/edition-web"

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const signInWithPassword = useSignInWithPassword()
  const requestSignInOtp = useRequestSignInOtp()
  const setAuthFlow = useAuthFlowStore((state) => state.setAuthFlow)
  const [email, setEmail] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [googleError, setGoogleError] = useState<unknown>(null)
  const [isGooglePending, setIsGooglePending] = useState(false)
  const isPending =
    signInWithPassword.isPending ||
    requestSignInOtp.isPending ||
    isGooglePending

  async function handleGoogleSignIn() {
    setGoogleError(null)
    setIsGooglePending(true)

    try {
      await signInWithGoogle(getAuthReturnPath("/recents"))
    } catch (error) {
      setGoogleError(error)
      setIsGooglePending(false)
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
    <form
      className={cn("flex flex-col gap-6", className)}
      onSubmit={handleSubmit}
      {...props}
    >
      {editionWebModule.additionalLoginMethods.map((LoginMethod, index) => (
        <LoginMethod disabled={isPending} key={index} />
      ))}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Email address</FieldLabel>
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

        {(signInWithPassword.isError ||
          requestSignInOtp.isError ||
          googleError != null) && (
          <FieldError>
            {getApiErrorMessage(
              signInWithPassword.error ?? requestSignInOtp.error ?? googleError,
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
            onClick={() => void handleGoogleSignIn()}
          >
            <GoogleIcon />
            {isGooglePending ? "Redirecting..." : "Continue with Google"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}
