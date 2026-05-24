"use client"

import * as React from "react"
import { ArrowLeftIcon, GalleryVerticalEndIcon, RotateCcwIcon } from "lucide-react"
import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
} from "@/components/ui/field"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp"
import { cn } from "@/lib/utils"

export function OtpForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [code, setCode] = React.useState("")
  const [resendCount, setResendCount] = React.useState(0)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
  }

  function handleResend() {
    setCode("")
    setResendCount((currentCount) => currentCount + 1)
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
              We sent a 6-digit code to your email.
            </FieldDescription>
          </div>

          <Field className="items-center">
            <InputOTP
              maxLength={6}
              value={code}
              onChange={setCode}
              containerClassName="justify-center"
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

          <Field>
            <Button type="submit" disabled={code.length !== 6}>
              Continue
            </Button>
          </Field>

          <Field className="items-center gap-3">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleResend}
            >
              <RotateCcwIcon />
              Resend code
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
