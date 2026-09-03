import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { Trash2Icon } from "@/shared/components/icons"
import { toast } from "sonner"

import { clearApiAuthToken, getApiErrorMessage } from "@/features/desktop/network/api"
import { useAppStore } from "@/features/desktop/state/app-store"
import { clearAllOfflineData } from "@/features/offline"
import { queryClient } from "@/app/query-client"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog"
import { Button } from "@/shared/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import { Separator } from "@/shared/ui/separator"
import { Spinner } from "@/shared/ui/spinner"
import {
  useChangePassword,
  useDeleteAccount,
  useSession,
  useSetPassword,
} from "@zilobase/features/auth"

import { SettingsHeader } from "../components/settings-header"

export default function SecuritySettingsPage() {
  const { data: sessionData } = useSession()
  const user = sessionData?.user

  return (
    <main className="flex min-h-full flex-1 flex-col gap-6 px-4 py-8">
      <SettingsHeader
        title="Security"
        description="Manage your password and account security."
      />

      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <PasswordCard
          hasPassword={user?.hasPassword ?? true}
          isReady={Boolean(user)}
        />
        <Separator />
        <DeleteAccountSection
          email={user?.email ?? ""}
          hasPassword={user?.hasPassword ?? true}
          isReady={Boolean(user)}
        />
      </div>
    </main>
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
  const canSubmit = Boolean(
    (hasPassword ? currentPassword : true) && newPassword && confirmPassword,
  ) && !isPending

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
    const onSuccess = () => {
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      toast.success(hasPassword ? "Password updated." : "Password set.")
    }
    const onError = (mutationError: Error) => {
      setError(getApiErrorMessage(mutationError))
    }

    if (hasPassword) {
      changePassword.mutate({ currentPassword, newPassword }, { onError, onSuccess })
    } else {
      setPassword.mutate({ newPassword }, { onError, onSuccess })
    }
  }

  return (
    <section className="grid gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h3 className="font-heading text-base leading-snug font-medium">Password</h3>
          <p className="text-sm text-content-secondary">
            {hasPassword
              ? "Change the password associated with your account."
              : "Set a password for signing in to your account."}
          </p>
        </div>
        <Button
          className="shrink-0"
          disabled={!isReady || !canSubmit}
          form="security-password-form"
          type="submit"
        >
          {isPending ? <Spinner /> : null}
          {hasPassword ? "Update password" : "Set password"}
        </Button>
      </div>
      <form className="grid gap-4" id="security-password-form" onSubmit={updatePassword}>
        <FieldGroup>
          {hasPassword ? (
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="security-current-password">Current password</FieldLabel>
              <Input
                autoComplete="current-password"
                disabled={!isReady || isPending}
                id="security-current-password"
                onChange={(event) => {
                  setCurrentPassword(event.target.value)
                  if (error) setError("")
                }}
                type="password"
                value={currentPassword}
              />
            </Field>
          ) : null}
          <Field>
            <FieldLabel htmlFor="security-new-password">
              {hasPassword ? "New password" : "Password"}
            </FieldLabel>
            <Input
              autoComplete="new-password"
              disabled={!isReady || isPending}
              id="security-new-password"
              minLength={8}
              onChange={(event) => {
                setNewPassword(event.target.value)
                if (error) setError("")
              }}
              type="password"
              value={newPassword}
            />
          </Field>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="security-confirm-password">Confirm new password</FieldLabel>
            <Input
              autoComplete="new-password"
              disabled={!isReady || isPending}
              id="security-confirm-password"
              minLength={8}
              onChange={(event) => {
                setConfirmPassword(event.target.value)
                if (error) setError("")
              }}
              type="password"
              value={confirmPassword}
            />
            <FieldDescription>Use a password you have not used elsewhere.</FieldDescription>
            <FieldError>{error}</FieldError>
          </Field>
        </FieldGroup>
      </form>
    </section>
  )
}

function DeleteAccountSection({
  email,
  hasPassword,
  isReady,
}: {
  email: string
  hasPassword: boolean
  isReady: boolean
}) {
  const navigate = useNavigate()
  const deleteAccount = useDeleteAccount()
  const [open, setOpen] = React.useState(false)
  const [confirmation, setConfirmation] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState("")
  const matches = confirmation.trim().toLowerCase() === email.trim().toLowerCase()
  const canDelete = matches && (!hasPassword || Boolean(password)) && !deleteAccount.isPending

  const reset = () => {
    setConfirmation("")
    setPassword("")
    setError("")
  }

  const confirmDelete = () => {
    if (!canDelete) return
    setError("")
    deleteAccount.mutate(
      { password: hasPassword ? password : undefined },
      {
        onError: (mutationError) => setError(getApiErrorMessage(mutationError)),
        onSuccess: async () => {
          await clearApiAuthToken()
          await clearAllOfflineData()
          queryClient.clear()
          useAppStore.getState().resetAccountState()
          setOpen(false)
          toast.success("Your account was deleted.")
          await navigate({ to: "/login", replace: true })
        },
      },
    )
  }

  return (
    <section className="grid gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h3 className="font-heading text-base leading-snug font-medium">Delete account</h3>
          <p className="text-sm text-content-secondary">
            Permanently delete your account, sessions, and personal settings. Workspaces you solely own must be deleted or assigned another owner first.
          </p>
        </div>
        <Button
          className="shrink-0"
          disabled={!isReady}
          onClick={() => setOpen(true)}
          type="button"
          variant="destructive"
        >
          <Trash2Icon />
          Delete account
        </Button>
      </div>

      <AlertDialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (deleteAccount.isPending) return
          setOpen(nextOpen)
          if (!nextOpen) reset()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Type <strong>{email}</strong> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FieldGroup>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="delete-account-confirmation">Email address</FieldLabel>
              <Input
                autoComplete="off"
                autoFocus
                disabled={deleteAccount.isPending}
                id="delete-account-confirmation"
                onChange={(event) => {
                  setConfirmation(event.target.value)
                  if (error) setError("")
                }}
                value={confirmation}
              />
            </Field>
            {hasPassword ? (
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="delete-account-password">Current password</FieldLabel>
                <Input
                  autoComplete="current-password"
                  disabled={deleteAccount.isPending}
                  id="delete-account-password"
                  onChange={(event) => {
                    setPassword(event.target.value)
                    if (error) setError("")
                  }}
                  type="password"
                  value={password}
                />
                <FieldError>{error}</FieldError>
              </Field>
            ) : (
              <FieldError>{error}</FieldError>
            )}
          </FieldGroup>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAccount.isPending}>Cancel</AlertDialogCancel>
            <Button disabled={!canDelete} onClick={confirmDelete} type="button" variant="destructive">
              {deleteAccount.isPending ? <Spinner /> : <Trash2Icon />}
              {deleteAccount.isPending ? "Deleting..." : "Delete account"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
