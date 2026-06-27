import * as React from "react"
import { toast } from "sonner"

import { SettingsHeader } from "@/components/settings-header"
import { Button } from "@/components/ui/button"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { getApiErrorMessage } from "@/lib/api"
import {
  useChangePassword,
  useSetPassword,
  useSession,
  useUpdateUserProfile,
} from "@notelab/features/auth"

export default function ProfileSettingsPage() {
  const { data: sessionData } = useSession()

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 py-8">
      <SettingsHeader
        title="Profile"
        description="Update your personal details and account preferences."
      />

      <div className="mx-auto grid w-full max-w-4xl gap-6">
        <ProfileDetailsCard
          initialEmail={sessionData?.user?.email ?? ""}
          initialName={sessionData?.user?.name ?? ""}
          isReady={Boolean(sessionData?.user)}
        />
        <Separator />
        <PasswordCard
          hasPassword={sessionData?.user?.hasPassword ?? true}
          isReady={Boolean(sessionData?.user)}
        />
      </div>
    </main>
  )
}

function ProfileDetailsCard({
  initialEmail,
  initialName,
  isReady,
}: {
  initialEmail: string
  initialName: string
  isReady: boolean
}) {
  const updateUserProfile = useUpdateUserProfile()
  const [name, setName] = React.useState(initialName)
  const [email, setEmail] = React.useState(initialEmail)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    setName(initialName)
    setEmail(initialEmail)
  }, [initialEmail, initialName])

  const hasChanges =
    name.trim() !== initialName.trim() ||
    email.trim().toLowerCase() !== initialEmail.trim().toLowerCase()

  const saveProfile = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedName = name.trim()
    const trimmedEmail = email.trim().toLowerCase()

    if (!trimmedName) {
      setError("Name is required.")
      return
    }

    if (!isValidEmail(trimmedEmail)) {
      setError("Enter a valid email address.")
      return
    }

    setError("")
    updateUserProfile.mutate(
      {
        email: trimmedEmail,
        name: trimmedName,
      },
      {
        onSuccess: () => {
          toast.success("Profile updated.")
        },
        onError: (mutationError) => {
          setError(getApiErrorMessage(mutationError))
        },
      },
    )
  }

  return (
    <section className="grid gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h3 className="font-heading text-base leading-snug font-medium">
            Personal details
          </h3>
          <p className="text-sm text-muted-foreground">
            Update the name and email tied to your account.
          </p>
        </div>
        <Button
          className="shrink-0"
          disabled={!isReady || !hasChanges || updateUserProfile.isPending}
          form="profile-details-form"
          type="submit"
        >
          {updateUserProfile.isPending ? <Spinner /> : null}
          Save changes
        </Button>
      </div>
      <form
        className="grid gap-4"
        id="profile-details-form"
        onSubmit={saveProfile}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="profile-name">Name</FieldLabel>
            <Input
              autoComplete="name"
              disabled={!isReady || updateUserProfile.isPending}
              id="profile-name"
              onChange={(event) => {
                setName(event.target.value)
                if (error) {
                  setError("")
                }
              }}
              placeholder="Your name"
              value={name}
            />
          </Field>

          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="profile-email">Email</FieldLabel>
            <Input
              autoComplete="email"
              disabled={!isReady || updateUserProfile.isPending}
              id="profile-email"
              onChange={(event) => {
                setEmail(event.target.value)
                if (error) {
                  setError("")
                }
              }}
              placeholder="you@example.com"
              type="email"
              value={email}
            />
            <FieldDescription>
              This address is used for sign-in and page invitations.
            </FieldDescription>
            <FieldError>{error}</FieldError>
          </Field>
        </FieldGroup>
      </form>
    </section>
  )
}

function PasswordCard({
  hasPassword,
  isReady,
}: {
  hasPassword: boolean
  isReady: boolean
}) {
  const changePassword = useChangePassword()
  const setPassword = useSetPassword()
  const [currentPassword, setCurrentPassword] = React.useState("")
  const [newPassword, setNewPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [error, setError] = React.useState("")
  const isPending = changePassword.isPending || setPassword.isPending

  const canSubmit =
    Boolean(
      (hasPassword ? currentPassword : true) && newPassword && confirmPassword,
    ) &&
    !isPending

  const updatePassword = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.")
      return
    }

    if (hasPassword && newPassword === currentPassword) {
      setError("Choose a new password that is different from the current one.")
      return
    }

    setError("")

    if (!hasPassword) {
      setPassword.mutate(
        { newPassword },
        {
          onSuccess: () => {
            setCurrentPassword("")
            setNewPassword("")
            setConfirmPassword("")
            toast.success("Password set.")
          },
          onError: (mutationError) => {
            setError(getApiErrorMessage(mutationError))
          },
        },
      )
      return
    }

    changePassword.mutate(
      {
        currentPassword,
        newPassword,
      },
      {
        onSuccess: () => {
          setCurrentPassword("")
          setNewPassword("")
          setConfirmPassword("")
          toast.success("Password updated.")
        },
        onError: (mutationError) => {
          setError(getApiErrorMessage(mutationError))
        },
      },
    )
  }

  const passwordActionLabel = hasPassword ? "Update password" : "Set password"

  return (
    <section className="grid gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h3 className="font-heading text-base leading-snug font-medium">
            Password
          </h3>
          <p className="text-sm text-muted-foreground">
            {hasPassword
              ? "Change the password associated with your account."
              : "Set a password for signing in to your account."}
          </p>
        </div>
        <Button
          className="shrink-0"
          disabled={!isReady || !canSubmit}
          form="profile-password-form"
          type="submit"
        >
          {isPending ? <Spinner /> : null}
          {passwordActionLabel}
        </Button>
      </div>
      <form
        className="grid gap-4"
        id="profile-password-form"
        onSubmit={updatePassword}
      >
        <FieldGroup>
          {hasPassword && (
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="profile-current-password">
                Current password
              </FieldLabel>
              <Input
                autoComplete="current-password"
                disabled={!isReady || isPending}
                id="profile-current-password"
                onChange={(event) => {
                  setCurrentPassword(event.target.value)
                  if (error) {
                    setError("")
                  }
                }}
                type="password"
                value={currentPassword}
              />
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="profile-new-password">
              {hasPassword ? "New password" : "Password"}
            </FieldLabel>
            <Input
              autoComplete="new-password"
              disabled={!isReady || isPending}
              id="profile-new-password"
              minLength={8}
              onChange={(event) => {
                setNewPassword(event.target.value)
                if (error) {
                  setError("")
                }
              }}
              type="password"
              value={newPassword}
            />
          </Field>

          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="profile-confirm-password">
              Confirm new password
            </FieldLabel>
            <Input
              autoComplete="new-password"
              disabled={!isReady || isPending}
              id="profile-confirm-password"
              minLength={8}
              onChange={(event) => {
                setConfirmPassword(event.target.value)
                if (error) {
                  setError("")
                }
              }}
              type="password"
              value={confirmPassword}
            />
            <FieldDescription>
              Use a password you have not used elsewhere.
            </FieldDescription>
            <FieldError>{error}</FieldError>
          </Field>
        </FieldGroup>
      </form>
    </section>
  )
}

function isValidEmail(value: string) {
  return /\S+@\S+\.\S+/.test(value)
}
