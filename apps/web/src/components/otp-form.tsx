"use client"

import * as React from "react"
import { ArrowLeftIcon, GalleryVerticalEndIcon, RotateCcwIcon } from "lucide-react"
import { Link, useNavigate } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
} from "@/components/ui/field"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { cn } from "@/lib/utils"
import { getApiErrorMessage } from "@/lib/api"
import {
  useRequestEmailVerificationOtp,
  useRequestSignInOtp,
  useSignInWithOtp,
  useVerifyEmailOtp,
} from "@/features/auth/hooks"
import { useAuthFlowStore } from "@/stores/auth-flow-store"

export function OtpForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const navigate = useNavigate()
  const [code, setCode] = React.useState("")
  const [resendCount, setResendCount] = React.useState(0)
  const { clearAuthFlow, email, purpose, returnTo } = useAuthFlowStore()
  const signInWithOtp = useSignInWithOtp()
  const verifyEmailOtp = useVerifyEmailOtp()
  const requestSignInOtp = useRequestSignInOtp()
  const requestEmailVerificationOtp = useRequestEmailVerificationOtp()
  const isVerifying = signInWithOtp.isPending || verifyEmailOtp.isPending
  const isResending = requestSignInOtp.isPending || requestEmailVerificationOtp.isPending
  const verificationError = signInWithOtp.error ?? verifyEmailOtp.error
  const resendError = requestSignInOtp.error ?? requestEmailVerificationOtp.error

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!email || !purpose) {
      return
    }

    try {
      if (purpose === "sign-in") {
        await signInWithOtp.mutateAsync({ email, otp: code })
        clearAuthFlow()
        if (returnTo) {
          window.location.assign(returnTo)
        } else {
          void navigate({ to: "/dashboard" })
        }
        return
      }

      await verifyEmailOtp.mutateAsync({ email, otp: code })
      clearAuthFlow()
      void navigate({ to: "/onboarding" })
    } catch {
      // React Query owns the visible error state.
    }
  }

  async function handleResend() {
    if (!email || !purpose) {
      return
    }

    setCode("")
    try {
      if (purpose === "sign-in") {
        await requestSignInOtp.mutateAsync(email)
      } else {
        await requestEmailVerificationOtp.mutateAsync(email)
      }
      setResendCount((currentCount) => currentCount + 1)
    } catch {
      // React Query owns the visible error state.
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <a
              href="#"
              className="flex flex-col items-center gap-2 font-medium"
            >
              <div className="flex size-8 items-center justify-center rounded-md">
                <GalleryVerticalEndIcon className="size-6" />
              </div>
              <span className="sr-only">Notelab</span>
            </a>
            <h1 className="text-xl font-bold">Enter verification code</h1>
            <FieldDescription className="text-center">
              {email
                ? `We sent a 6-digit code to ${email}.`
                : "Start from login or signup to receive a code."}
            </FieldDescription>
          </div>

          <Field className="items-center">
            <InputOTP
              maxLength={6}
              value={code}
              onChange={setCode}
              containerClassName="justify-center"
              disabled={isVerifying}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </Field>

          {(verificationError || resendError) && (
            <FieldError>
              {getApiErrorMessage(verificationError ?? resendError)}
            </FieldError>
          )}

          <Field>
            <Button
              type="submit"
              disabled={!email || !purpose || code.length !== 6 || isVerifying}
            >
              {isVerifying ? "Checking code..." : "Continue"}
            </Button>
          </Field>

          <Field className="items-center gap-3">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleResend}
              disabled={!email || !purpose || isResending}
            >
              <RotateCcwIcon />
              {isResending ? "Sending..." : "Resend code"}
            </Button>
            <FieldDescription className="text-center">
              {resendCount > 0
                ? "A fresh code is on the way."
                : "Did not receive a code?"}
            </FieldDescription>
          </Field>

          <Field>
            <Button asChild type="button" variant="ghost">
              <Link to="/login">
                <ArrowLeftIcon />
                Back to login
              </Link>
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </div>
  )
}
