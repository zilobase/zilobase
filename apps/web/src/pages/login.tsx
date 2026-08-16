import { useSearch } from "@tanstack/react-router"

import { LoginForm } from "@/components/login-form"

export default function LoginPage() {
  const { changeServer } = useSearch({ from: "/login" })

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm changeServer={changeServer} />
      </div>
    </main>
  )
}
