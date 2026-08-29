import { isDesktopApp } from "@/features/desktop/index"

import { AuthScreen } from "../components/auth-screen"
import { DesktopBrowserAuthScreen } from "@/features/desktop/auth/index"
import { SignupForm } from "../components/signup-form"
import { getInvitationAuthSearch } from "../lib/google-auth"

export default function SignupPage() {
  const invitationSearch = getInvitationAuthSearch()

  if (isDesktopApp()) {
    return <DesktopBrowserAuthScreen />
  }

  return (
    <AuthScreen
      switchLabel="Sign in"
      switchPrefix="Already have an account?"
      switchSearch={
        invitationSearch.returnTo
          ? { returnTo: invitationSearch.returnTo }
          : {}
      }
      switchTo="/login"
      title="Create an account"
    >
      <SignupForm />
    </AuthScreen>
  )
}
