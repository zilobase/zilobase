import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { CameraIcon, LogOutIcon, Trash2Icon } from "@/shared/components/icons"
import { toast } from "sonner"

import { SettingsHeader } from "../components/settings-header"
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar"
import { Button } from "@/shared/ui/button"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/shared/ui/field"
import { Input } from "@/shared/ui/input"
import { Spinner } from "@/shared/ui/spinner"
import { getApiErrorMessage } from "@/platform/network/api"
import {
  getUserImageUrl,
  removeProfileImage,
  uploadProfileImage,
} from "@/platform/network/image-upload"
import { clearAllIndexedData } from "@/platform/storage/indexed-data-cleanup"
import { useQueryClient } from "@tanstack/react-query"
import { sessionQueryKey, type SessionResponse } from "@zilobase/features/auth";
import { useSession, useSignOut, useUpdateUserProfile } from "@zilobase/features/auth/react";

export default function ProfileSettingsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: sessionData } = useSession()
  const signOut = useSignOut()

  const finishSignOut = async () => {
    signOut.mutate(undefined, {
      onSuccess: async () => {
        await clearAllIndexedData().catch(() => undefined)
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
        description="Update your personal details and manage your session."
      />

      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <ProfileDetailsCard
          initialEmail={sessionData?.user?.email ?? ""}
          initialImage={sessionData?.user?.image ?? null}
          initialName={sessionData?.user?.name ?? ""}
          isReady={Boolean(sessionData?.user)}
        />
      </div>

      <div className="mx-auto mt-auto flex w-full max-w-3xl justify-end pt-2">
        <Button
          disabled={signOut.isPending}
          onClick={() => void finishSignOut()}
          type="button"
          variant="destructive"
        >
          {signOut.isPending ? <Spinner /> : <LogOutIcon />}
          {signOut.isPending ? "Logging out..." : "Log out"}
        </Button>
      </div>
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
  const queryClient = useQueryClient()
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
          <p className="text-sm text-content-secondary">
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
            <p className="text-xs text-content-secondary">
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
