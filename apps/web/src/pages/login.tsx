import { isTauri } from "@tauri-apps/api/core"

import { AuthScreen } from "@/components/auth-screen"
import { DesktopBrowserAuthScreen } from "@/components/desktop-browser-auth-screen"
import { LoginForm } from "@/components/login-form"
import { getInvitationAuthSearch } from "@/lib/google-auth"

export default function LoginPage() {
  const signupSearch = getInvitationAuthSearch()

  if (isTauri()) {
    return <DesktopBrowserAuthScreen />
  }

  return (
    <AuthScreen
      switchLabel="Sign up"
      switchPrefix="Don't have an account?"
      switchSearch={signupSearch}
      switchTo="/signup"
      title="Sign in to your account"
    >
      <LoginForm />
    </AuthScreen>
  )
}
