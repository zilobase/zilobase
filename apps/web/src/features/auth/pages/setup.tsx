import { useState } from "react"

import { Button } from "@/shared/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import { apiFetch, getApiErrorMessage } from "@/lib/api"

export default function SetupPage() {
  const [error, setError] = useState<unknown>(null)
  const [isPending, setIsPending] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsPending(true)

    const form = new FormData(event.currentTarget)

    try {
      await apiFetch("/api/instance/bootstrap", {
        auth: false,
        body: JSON.stringify({
          email: String(form.get("email") ?? "").trim().toLowerCase(),
          name: String(form.get("name") ?? "").trim(),
          password: String(form.get("password") ?? ""),
          workspaceName: String(form.get("workspaceName") ?? "").trim(),
        }),
        headers: {
          "x-zilobase-bootstrap-token": String(
            form.get("bootstrapToken") ?? "",
          ).trim(),
        },
        method: "POST",
      })

      window.location.assign("/login")
    } catch (error) {
      setError(error)
      setIsPending(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6 md:p-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Set up your Zilobase server</CardTitle>
          <CardDescription>
            Create the initial owner and workspace. This operation can only run
            once.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="bootstrapToken">Bootstrap token</FieldLabel>
                <Input
                  autoComplete="off"
                  disabled={isPending}
                  id="bootstrapToken"
                  minLength={32}
                  name="bootstrapToken"
                  required
                  type="password"
                />
                <FieldDescription>
                  Use the token from your self-host environment file. It is sent
                  only in the request header and is never saved by this page.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="workspaceName">Workspace name</FieldLabel>
                <Input
                  autoFocus
                  disabled={isPending}
                  id="workspaceName"
                  maxLength={120}
                  name="workspaceName"
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="name">Owner name</FieldLabel>
                <Input
                  autoComplete="name"
                  disabled={isPending}
                  id="name"
                  maxLength={100}
                  name="name"
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="email">Owner email</FieldLabel>
                <Input
                  autoComplete="email"
                  disabled={isPending}
                  id="email"
                  maxLength={320}
                  name="email"
                  required
                  type="email"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="password">Owner password</FieldLabel>
                <Input
                  autoComplete="new-password"
                  disabled={isPending}
                  id="password"
                  maxLength={128}
                  minLength={8}
                  name="password"
                  required
                  type="password"
                />
              </Field>

              {error != null && <FieldError>{getApiErrorMessage(error)}</FieldError>}

              <Button disabled={isPending} type="submit">
                {isPending ? "Creating server owner..." : "Complete setup"}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
