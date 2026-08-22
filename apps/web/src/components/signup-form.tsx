"use client"

import { useState } from "react"
import { EyeIcon, EyeOffIcon } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { GoogleIcon } from "@/components/google-icon"
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
import { getInvitationAuthSearch, signInWithGoogle } from "@/lib/google-auth"
import { cn } from "@/lib/utils"
import { useAuthFlowStore } from "@/stores/auth-flow-store"
import {
  useRequestEmailVerificationOtp,
  useSignUp,
} from "@zilobase/features/auth"

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const navigate = useNavigate()
  const signUp = useSignUp()
  const requestVerificationOtp = useRequestEmailVerificationOtp()
  const setAuthFlow = useAuthFlowStore((state) => state.setAuthFlow)
  const [formError, setFormError] = useState<string | null>(null)
  const [googleError, setGoogleError] = useState<unknown>(null)
  const [isGooglePending, setIsGooglePending] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const isCreatingAccount = signUp.isPending || requestVerificationOtp.isPending
  const isPending = isCreatingAccount || isGooglePending
  const error = signUp.error ?? requestVerificationOtp.error ?? googleError
  const invitationSearch = getInvitationAuthSearch()
  const invitationId = invitationSearch.invitation ?? null
  const returnTo = invitationSearch.returnTo ?? "/onboarding"

  async function handleGoogleSignUp() {
    setGoogleError(null)
    setIsGooglePending(true)

    try {
      await signInWithGoogle(returnTo, invitationId)
    } catch (error) {
      setGoogleError(error)
      setIsGooglePending(false)
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const name = String(formData.get("name") ?? "").trim()
    const email = String(formData.get("email") ?? "").trim().toLowerCase()
    const password = String(formData.get("password") ?? "")
    const confirmPassword = String(formData.get("confirm-password") ?? "")

    if (password !== confirmPassword) {
      setFormError("Passwords do not match.")
      return
    }

    setFormError(null)
    try {
      await signUp.mutateAsync({
        callbackURL: returnTo,
        name,
        email,
        password,
        ...(invitationId ? { invitationId } : {}),
      })
      await requestVerificationOtp.mutateAsync(email)
      setAuthFlow({ email, purpose: "email-verification", returnTo })
      void navigate({ to: "/otp" })
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
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Full name</FieldLabel>
          <Input
            id="name"
            name="name"
            type="text"
            placeholder="John Doe"
            autoComplete="name"
            disabled={isPending}
            required
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="email">Email address</FieldLabel>
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
              autoComplete="new-password"
              disabled={isPending}
              minLength={8}
              required
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                aria-label={showPassword ? "Hide passwords" : "Show passwords"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
                size="icon-xs"
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          <FieldDescription>
            Use at least 8 characters.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel>
          <Input
            id="confirm-password"
            name="confirm-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            disabled={isPending}
            minLength={8}
            required
          />
        </Field>

        {(formError !== null || error != null) && (
          <FieldError>{formError ?? getApiErrorMessage(error)}</FieldError>
        )}

        <Field>
          <Button type="submit" disabled={isPending}>
            {isCreatingAccount ? "Creating account..." : "Create free account"}
          </Button>
        </Field>

        <FieldSeparator>Or</FieldSeparator>

        <Field>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={handleGoogleSignUp}
          >
            <GoogleIcon />
            {isGooglePending ? "Opening Google..." : "Continue with Google"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}
