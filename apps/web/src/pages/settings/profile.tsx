import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { CameraIcon, DownloadIcon, LogOutIcon, Trash2Icon } from "@/shared/components/icons"
import { toast } from "sonner"

import { SettingsHeader } from "@/components/settings-header"
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar"
import { Button } from "@/shared/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog"

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
import { getApiErrorMessage } from "@/lib/api"
import {
  getUserImageUrl,
  removeProfileImage,
  uploadProfileImage,
} from "@/lib/image-upload"
import {
  clearAllOfflineData,
  getConnectivityState,
} from "@/lib/offline-store"
import {
  downloadRecoveryArchive,
  syncDirtyOfflinePages,
} from "@/lib/offline-recovery"
import { clearApiAuthToken } from "@/lib/api"
import { queryClient } from "@/lib/query-client"
import { useAppStore } from "@/stores/app-store"
import { useOfflineManifest } from "@/providers/offline-provider"
import {
  sessionQueryKey,
  type SessionResponse,
  useChangePassword,
  useSetPassword,
  useSession,
  useSignOut,
  useUpdateUserProfile,
} from "@zilobase/features/auth"

export default function ProfileSettingsPage() {
  const navigate = useNavigate()
  const { data: sessionData } = useSession()
  const signOut = useSignOut()
  const manifest = useOfflineManifest()
  const [logoutDialog, setLogoutDialog] = React.useState<"choices" | "discard" | null>(null)

  const handleSignOut = () => {
    if (manifest.items.some((item) => item.kind === "page" && (item.dirty || item.blocked))) {
      setLogoutDialog("choices")
      return
    }
    void finishSignOut()
  }

  const finishSignOut = async () => {
    if (getConnectivityState() !== "online") {
      await clearApiAuthToken()
      await clearAllOfflineData()
      queryClient.clear()
      useAppStore.getState().resetAccountState()
      toast.info("Local data was cleared. The remote session will expire normally.")
      await navigate({ to: "/login", replace: true })
      return
    }
    signOut.mutate(undefined, {
      onSuccess: async () => {
        await clearAllOfflineData()
        queryClient.clear()
        void navigate({ to: "/login", replace: true })
      },
      onError: (error) => {
        toast.error(getApiErrorMessage(error))
      },
    })
  }

  return (
    <main className="flex min-h-full flex-1 flex-col gap-6 px-4 py-8">
      <SettingsHeader
        title="Profile"
        description="Update your personal details and account security."
      />

      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <ProfileDetailsCard
          initialEmail={sessionData?.user?.email ?? ""}
          initialImage={sessionData?.user?.image ?? null}
          initialName={sessionData?.user?.name ?? ""}
          isReady={Boolean(sessionData?.user)}
        />
        <Separator />
        <PasswordCard
          hasPassword={sessionData?.user?.hasPassword ?? true}
          isReady={Boolean(sessionData?.user)}
        />
      </div>

      <div className="mx-auto mt-auto flex w-full max-w-3xl justify-end pt-2">
        <Button
          disabled={signOut.isPending}
          onClick={handleSignOut}
          type="button"
          variant="destructive"
        >
          {signOut.isPending ? <Spinner /> : <LogOutIcon />}
          {signOut.isPending ? "Logging out..." : "Log out"}
        </Button>
      </div>
      <AlertDialog open={logoutDialog !== null} onOpenChange={(open) => !open && setLogoutDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {logoutDialog === "discard" ? "Discard unsynced changes?" : "Unsynced offline changes"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {logoutDialog === "discard"
                ? "This permanently deletes the local drafts from this Mac and cannot be undone."
                : "Logging out would remove local content. Sync it or export a recovery archive first."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {logoutDialog === "choices" ? (
            <div className="grid gap-2">
              <Button
                onClick={async () => {
                  const results = await syncDirtyOfflinePages().catch((error) => {
                    toast.error(getApiErrorMessage(error)); return null
                  })
                  if (results?.every((result) => result.success)) await finishSignOut()
                  else if (results) toast.error("Some drafts could not be synced. Export them before logging out.")
                }}
                type="button"
              >Reconnect and sync</Button>
              <Button
                onClick={async () => {
                  try {
                    await downloadRecoveryArchive()
                    await finishSignOut()
                  } catch (error) { toast.error(getApiErrorMessage(error)) }
                }}
                type="button"
                variant="outline"
              ><DownloadIcon /> Export recovery and continue</Button>
              <Button onClick={() => setLogoutDialog("discard")} type="button" variant="destructive">
                Discard changes
              </Button>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {logoutDialog === "discard" ? (
              <AlertDialogAction onClick={() => void finishSignOut()} variant="destructive">
                Permanently discard and log out
              </AlertDialogAction>
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}

function ProfileDetailsCard({
  initialEmail,
  initialImage,
  initialName,
  isReady,
}: {
  initialEmail: string
  initialImage: string | null
  initialName: string
  isReady: boolean
}) {
  const updateUserProfile = useUpdateUserProfile()
  const imageInputRef = React.useRef<HTMLInputElement | null>(null)
  const [name, setName] = React.useState(initialName)
  const [email, setEmail] = React.useState(initialEmail)
  const [profileImage, setProfileImage] = React.useState<string | null>(initialImage)
  const [imageAction, setImageAction] = React.useState<"remove" | "upload" | null>(null)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    setName(initialName)
    setEmail(initialEmail)
    setProfileImage(initialImage)
  }, [initialEmail, initialImage, initialName])

  const updateSessionImage = (image: string | null) => {
    queryClient.setQueryData<SessionResponse>(sessionQueryKey, (current) => {
      if (!current?.user) {
        return current
      }

      return {
        ...current,
        user: { ...current.user, image },
      }
    })
  }

  const selectProfileImage = async (file: File | undefined) => {
    if (!file) {
      return
    }

    const previousImage = profileImage
    const previewUrl = URL.createObjectURL(file)
    setProfileImage(previewUrl)
    setImageAction("upload")

    try {
      const result = await uploadProfileImage(file)
      setProfileImage(result.image)
      updateSessionImage(result.image)
      toast.success("Profile picture updated.")
    } catch (uploadError) {
      setProfileImage(previousImage)
      toast.error(getApiErrorMessage(uploadError))
    } finally {
      URL.revokeObjectURL(previewUrl)
      setImageAction(null)
    }
  }

  const deleteProfileImage = async () => {
    setImageAction("remove")

    try {
      await removeProfileImage()
      setProfileImage(null)
      updateSessionImage(null)
      toast.success("Profile picture removed.")
    } catch (removeError) {
      toast.error(getApiErrorMessage(removeError))
    } finally {
      setImageAction(null)
    }
  }

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
            Update the photo, name and email tied to your account.
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
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            {profileImage ? (
              <AvatarImage
                alt={`${name || "Your"} profile picture`}
                src={getUserImageUrl(profileImage)}
              />
            ) : null}
            <AvatarFallback
              className="text-base"
              gradientSeed={name || initialEmail}
            >
              {getInitials(name || initialEmail)}
            </AvatarFallback>
          </Avatar>
          <div className="grid gap-2">
            <input
              accept="image/avif,image/gif,image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={!isReady || imageAction !== null}
              onChange={(event) => {
                void selectProfileImage(event.target.files?.[0])
                event.target.value = ""
              }}
              ref={imageInputRef}
              type="file"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!isReady || imageAction !== null}
                onClick={() => imageInputRef.current?.click()}
                size="sm"
                type="button"
                variant="outline"
              >
                {imageAction === "upload" ? <Spinner /> : <CameraIcon />}
                {profileImage ? "Change photo" : "Upload photo"}
              </Button>
              {profileImage ? (
                <Button
                  disabled={!isReady || imageAction !== null}
                  onClick={() => void deleteProfileImage()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {imageAction === "remove" ? <Spinner /> : <Trash2Icon />}
                  Remove
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              JPG, PNG, GIF, WebP or AVIF. Maximum 5 MB.
            </p>
          </div>
        </div>
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

function getInitials(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?"
}
