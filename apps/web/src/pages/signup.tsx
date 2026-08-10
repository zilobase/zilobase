import { Link } from "@tanstack/react-router"

import { SignupForm } from "@/components/signup-form"
import { ZilobaseLogo } from "@/components/zilobase-logo"
import { FieldDescription } from "@/components/ui/field"

export default function SignupPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2">
          <ZilobaseLogo className="h-7 w-auto" />
          <span className="font-medium">Zilobase</span>
        </div>

        <div>
          <h1 className="text-lg font-semibold">Create an account</h1>
          <FieldDescription>
            Already have an account? <Link to="/login">Sign in</Link>
          </FieldDescription>
        </div>

        <SignupForm />
      </div>
    </main>
  )
}
