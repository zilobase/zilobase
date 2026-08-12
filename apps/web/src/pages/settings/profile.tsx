import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { DownloadIcon, HardDriveIcon, LogOutIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { toast } from "sonner"

import { SettingsHeader } from "@/components/settings-header"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

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
  clearAllOfflineData,
  disableOfflineWorkspace,
  enableOfflineWorkspace,
  getConnectivityState,
  isDesktopOfflineSupported,
} from "@/lib/offline-store"
import {
  downloadRecoveryArchive,
  importRecoveryArchive,
  syncDirtyOfflinePages,
} from "@/lib/offline-recovery"
import { clearApiAuthToken } from "@/lib/api"
import { queryClient } from "@/lib/query-client"
import { useAppStore } from "@/stores/app-store"
import { useOfflineManifest } from "@/providers/offline-provider"
import {
  useChangePassword,
  useSetPassword,
  useSession,
  useSignOut,
  useUpdateUserProfile,
} from "@zilobase/features/auth"
import { useWorkspaces } from "@zilobase/features/workspaces"

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
        {isDesktopOfflineSupported() ? (
          <>
            <Separator />
            <OfflineAccessCard />
          </>
        ) : null}
      </div>

      <div className="mx-auto mt-auto flex w-full max-w-4xl justify-end pt-2">
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

function OfflineAccessCard() {
  const { data: sessionData } = useSession()
  const { data: workspaces = [] } = useWorkspaces()
  const manifest = useOfflineManifest()
  const [pendingId, setPendingId] = React.useState<string | null>(null)
  const importInput = React.useRef<HTMLInputElement | null>(null)
  const [storageUsage, setStorageUsage] = React.useState<number | null>(null)
  const dirtyCount = manifest.items.filter(
    (item) => item.kind === "page" && (item.dirty || item.blocked),
  ).length

  React.useEffect(() => {
    void navigator.storage?.estimate?.().then((estimate) => {
      setStorageUsage(estimate.usage ?? null)
    })
  }, [manifest.items])

  const toggleWorkspace = async (workspace: (typeof workspaces)[number]) => {
    const enabled = manifest.workspaces.some((item) => item.id === workspace.id)
    setPendingId(workspace.id)
    try {
      if (enabled) {
        const removedItems = manifest.items.filter(
          (item) => item.workspaceId === workspace.id,
        )
        await disableOfflineWorkspace(workspace.id)
        queryClient.removeQueries({ queryKey: ["pages", workspace.id] })
        for (const item of removedItems) {
          queryClient.removeQueries({
            queryKey: [item.kind === "page" ? "page" : "database", item.id],
          })
        }
      } else {
        if (
          getConnectivityState() !== "online" ||
          !sessionData?.session ||
          !sessionData.user
        ) {
          throw new Error("Connect and sign in before enabling offline access.")
        }
        await enableOfflineWorkspace({
          accountId: sessionData.user.id,
          session: {
            session: sessionData.session,
            user: sessionData.user,
            validatedAt: new Date().toISOString(),
            workspacePinned: sessionData.workspacePinned,
          },
          workspace: {
            id: workspace.id,
            name: workspace.name,
            slug: workspace.slug,
          },
        })
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error))
    } finally {
      setPendingId(null)
    }
  }

  const removeAll = async () => {
    if (dirtyCount) {
      toast.error("Sync or export local drafts before removing offline data.")
      return
    }
    if (!window.confirm("Remove all offline content stored for this account?")) return
    await clearAllOfflineData()
    toast.success("Offline data removed from this Mac.")
  }

  return (
    <section className="grid gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 font-heading text-base font-medium">
            <HardDriveIcon className="size-4" />
            Offline access on this Mac
          </h3>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Choose workspaces that may store downloaded pages and databases locally.
            Content is not application-encrypted; protection relies on your macOS
            account and FileVault.
            {storageUsage !== null
              ? ` Approximate app storage: ${formatBytes(storageUsage)}.`
              : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <input
            accept=".zip,application/zip"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              if (!file) return
              try {
                const results = await importRecoveryArchive(file)
                const failed = results.filter((result) => !result.success)
                if (failed.length) toast.error(`${failed.length} page(s) could not be imported.`)
                else toast.success(`${results.length} page(s) imported and synced.`)
              } catch (error) { toast.error(getApiErrorMessage(error)) }
              event.target.value = ""
            }}
            ref={importInput}
            type="file"
          />
          <Button onClick={() => importInput.current?.click()} size="sm" type="button" variant="outline">
            <UploadIcon /> Import recovery
          </Button>
          <Button
            disabled={!manifest.workspaces.length}
            onClick={() => void removeAll()}
            size="sm"
            type="button"
            variant="outline"
          >
            <Trash2Icon /> Remove all
          </Button>
        </div>
      </div>
      <div className="divide-y rounded-md border">
        {workspaces.map((workspace) => {
          const enabled = manifest.workspaces.some((item) => item.id === workspace.id)
          const items = manifest.items.filter((item) => item.workspaceId === workspace.id)
          const lastSync = items
            .map((item) => item.lastSyncedAt)
            .filter((value): value is string => Boolean(value))
            .sort()
            .at(-1)
          return (
            <div className="flex items-center justify-between gap-3 p-3" key={workspace.id}>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{workspace.name}</p>
                <p className="text-xs text-muted-foreground">
                  {items.length} downloaded · {items.filter((item) => item.dirty || item.blocked).length} unsynced
                  {lastSync ? ` · Last sync ${new Date(lastSync).toLocaleString()}` : ""}
                </p>
              </div>
              <Button
                disabled={pendingId === workspace.id}
                onClick={() => void toggleWorkspace(workspace)}
                size="sm"
                type="button"
                variant={enabled ? "outline" : "default"}
              >
                {pendingId === workspace.id ? <Spinner /> : null}
                {enabled ? "Disable" : "Enable"}
              </Button>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Offline access ends when the cached session expires. Drafts stay stored but
        locked until you reconnect and sign in.
      </p>
    </section>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
