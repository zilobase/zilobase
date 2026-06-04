import { OtpForm } from "@/components/otp-form"

export default function OtpPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="w-full max-w-sm">
        <OtpForm />
      </div>
    </div>
  )
}
