import { AuthScreen } from "@/components/auth-screen"
import { LoginForm } from "@/components/login-form"
import { getInvitationAuthSearch } from "@/lib/google-auth"

export default function LoginPage() {
  const signupSearch = getInvitationAuthSearch()

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
