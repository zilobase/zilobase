import * as React from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { useTheme } from "next-themes"
import {
  BugIcon,
  CheckIcon,
  DownloadIcon,
  FolderOpenIcon,
  HardDriveIcon,
  ServerIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import { toast } from "sonner"

import { SettingsHeader } from "@/components/settings-header"
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
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { getApiErrorMessage } from "@/lib/api"
import {
  describeDesktopError,
  recordDesktopDiagnostic,
} from "@/lib/desktop-diagnostics"
import {
  clearAllOfflineData,
  clearDesktopServerIndexedData,
  disableOfflineWorkspace,
  enableOfflineWorkspace,
  getConnectivityState,
  hasUnsyncedOfflineItems,
  isDesktopOfflineSupported,
} from "@/lib/offline-store"
import { importRecoveryArchive } from "@/lib/offline-recovery"
import { DesktopConnectServerDialog } from "@/components/desktop-connect-server-dialog"
import { clearDesktopPersistKeys } from "@/lib/desktop-persist-storage"
import {
  getSelectedDesktopServer,
  listDesktopServerProfiles,
  removeDesktopServerProfile,
  type DesktopServerProfile,
} from "@/lib/desktop-server"
import { executeDesktopServerSwitch } from "@/lib/desktop-server-switch"
import { queryClient } from "@/lib/query-client"
import { useAppStore } from "@/stores/app-store"
import { useOfflineManifest } from "@/providers/offline-provider"
import { useSession } from "@zilobase/features/auth"
import { useWorkspaces } from "@zilobase/features/workspaces"
import {
  appearanceModes,
  themeFamilies,
  type AppearanceModeId,
  type ThemeFamilyId,
} from "@/lib/themes"
import { useThemeFamily } from "@/providers/theme-family-provider"

export default function PreferencesSettingsPage() {
  return (
    <main className="flex min-h-full flex-1 flex-col gap-6 px-4 py-8">
      <SettingsHeader
        title="Preferences"
        description="Customize Zilobase appearance and local storage."
      />

      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <AppearanceSection />
        {isDesktopOfflineSupported() ? (
          <>
            <Separator />
            <OfflineAccessSection />
          </>
        ) : null}
        {isTauri() ? (
          <>
            <Separator />
            <DesktopServerSection />
            <Separator />
            <DiagnosticsSection />
          </>
        ) : null}
      </div>
    </main>
  )
}

function DesktopServerSection() {
  const [connectOpen, setConnectOpen] = React.useState(false)
  const [profiles, setProfiles] = React.useState<DesktopServerProfile[]>([])
  const [removing, setRemoving] = React.useState<DesktopServerProfile | null>(
    null,
  )
  const [pending, setPending] = React.useState(false)
  const current = getSelectedDesktopServer()

  const refreshProfiles = React.useCallback(async () => {
    setProfiles((await listDesktopServerProfiles()).profiles)
  }, [])

  React.useEffect(() => {
    void refreshProfiles().catch(() => setProfiles([]))
  }, [refreshProfiles])

  const removeProfile = async (profile: DesktopServerProfile) => {
    setPending(true)
    try {
      await clearDesktopServerIndexedData(profile.server)
      clearDesktopPersistKeys(profile.server.instanceId)
      await removeDesktopServerProfile({
        apiOrigin: profile.server.apiOrigin,
        instanceId: profile.server.instanceId,
      })
      if (profile.active) {
        queryClient.clear()
        useAppStore.getState().resetAccountState()
        window.location.replace("/login")
        return
      }
      setRemoving(null)
      await refreshProfiles()
    } catch (error) {
      toast.error(getApiErrorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="grid gap-4">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 font-heading text-base font-medium">
          <ServerIcon className="size-4" />
          Desktop servers
        </h3>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Switch between saved servers without signing out of the others.
          Removing a server from this device deletes only that instance&apos;s
          credentials, cached data, offline documents, and tabs.
        </p>
      </div>
      <div className="grid gap-2">
        {(profiles.length
          ? profiles
          : current
            ? [
                {
                  active: true,
                  hasCredentials: true,
                  lastActiveWorkspaceId: null,
                  lastPath: null,
                  lastUsedAt: null,
                  server: current,
                  workspaces: [],
                } satisfies DesktopServerProfile,
              ]
            : []
        ).map((profile) => (
          <div
            className="flex items-center justify-between gap-3 rounded-lg border bg-subtle-surface p-3 text-sm"
            key={`${profile.server.instanceId}:${profile.server.apiOrigin}`}
          >
            <div className="min-w-0">
              <p className="text-xs/relaxed font-medium">
                {profile.server.displayName}
                {profile.active ? " · Active" : ""}
              </p>
              <p className="truncate text-xs/relaxed text-muted-foreground">
                {profile.server.apiOrigin}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {profile.active ? null : (
                <Button
                  onClick={() => {
                    void executeDesktopServerSwitch({
                      hasCredentials: profile.hasCredentials,
                      path: profile.hasCredentials
                        ? (profile.lastPath ?? "/recents")
                        : "/login",
                      server: profile.server,
                      workspaceId: profile.lastActiveWorkspaceId,
                    })
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Switch
                </Button>
              )}
              <Button
                onClick={() => setRemoving(profile)}
                size="sm"
                type="button"
                variant="ghost"
              >
                Remove from this device
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div>
        <Button
          onClick={() => setConnectOpen(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          Connect another server
        </Button>
      </div>
      <DesktopConnectServerDialog
        onOpenChange={setConnectOpen}
        open={connectOpen}
      />
      <AlertDialog
        onOpenChange={(open) => !pending && !open && setRemoving(null)}
        open={Boolean(removing)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {removing?.server.displayName} from this device?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This signs out of that instance and deletes only its local
              credentials, cache, offline documents, and tabs. Other saved
              servers stay on this device.
              {removing && hasUnsyncedOfflineItems() && removing.active
                ? " Unsynced local drafts on this server will be deleted."
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending || !removing}
              onClick={(event) => {
                event.preventDefault()
                if (removing) void removeProfile(removing)
              }}
            >
              {pending ? <Spinner /> : null}
              {pending ? "Removing..." : "Remove from this device"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function DiagnosticsSection() {
  const [busyAction, setBusyAction] = React.useState<"export" | "open" | null>(null)

  const openLogs = async () => {
    setBusyAction("open")
    try {
      await invoke("open_diagnostics_folder")
    } catch (error) {
      recordDesktopDiagnostic(
        "diagnostics.log_folder_opened",
        describeDesktopError(error),
        "error",
      )
      toast.error("Could not open the diagnostics folder.")
    } finally {
      setBusyAction(null)
    }
  }

  const exportDiagnostics = async () => {
    setBusyAction("export")
    try {
      const archivePath = await invoke<string>("export_diagnostics")
      toast.success("Diagnostics archive created.", {
        description: archivePath,
      })
    } catch (error) {
      recordDesktopDiagnostic(
        "diagnostics.export",
        describeDesktopError(error),
        "error",
      )
      toast.error("Could not export diagnostics.")
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 font-heading text-base font-medium">
            <BugIcon className="size-4" />
            Desktop diagnostics
          </h3>
          <p className="max-w-2xl text-sm text-muted-foreground">
            View local startup logs or create an archive to share when the desktop
            app does not start correctly. Authentication tokens, keyring values,
            account details, and document content are excluded.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            disabled={busyAction !== null}
            onClick={() => void openLogs()}
            type="button"
            variant="outline"
          >
            {busyAction === "open" ? <Spinner /> : <FolderOpenIcon />}
            Open logs
          </Button>
          <Button
            disabled={busyAction !== null}
            onClick={() => void exportDiagnostics()}
            type="button"
            variant="outline"
          >
            {busyAction === "export" ? <Spinner /> : <DownloadIcon />}
            Export diagnostics
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        If the window is blank, run <code>zilobase-client --diagnostics</code> in
        a terminal. The archive is written to the current directory.
      </p>
    </section>
  )
}

function AppearanceSection() {
  const { theme = "system", setTheme } = useTheme()
  const { themeFamily, setThemeFamily } = useThemeFamily()

  return (
    <section className="grid gap-3">
      <div className="space-y-1">
        <h3 className="font-heading text-base font-medium">Appearance</h3>
        <p className="text-sm text-muted-foreground">
          Choose how Zilobase looks on this device.
        </p>
      </div>
      <div className="grid gap-4">
        <div
          aria-label="Appearance mode"
          className="flex flex-wrap items-start gap-2"
          role="group"
        >
          {appearanceModes.map((option) => {
            const selected = theme === option.value

            return (
              <button
                aria-pressed={selected}
                className="group relative grid w-40 gap-1.5 rounded-lg p-1 text-left text-sm font-medium outline-none transition-colors hover:bg-subtle-surface focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-muted"
                key={option.value}
                onClick={() => setTheme(option.value as AppearanceModeId)}
                type="button"
              >
                <ThemePreview
                  mode={option.value}
                  selected={selected}
                  themeFamily={themeFamily}
                />
                <span className="flex items-center justify-between px-0.5">
                  {option.label}
                  {selected ? <CheckIcon className="size-4 text-primary" /> : null}
                </span>
              </button>
            )
          })}
        </div>

        <div className="grid gap-2">
          <span className="text-xs font-medium text-muted-foreground">Theme</span>
          <Select
            value={themeFamily}
            onValueChange={(value) => setThemeFamily(value as ThemeFamilyId)}
          >
            <SelectTrigger aria-label="Theme" className="w-full sm:w-72">
              <SelectValue placeholder="Select a theme" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Themes</SelectLabel>
                {themeFamilies.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
    </section>
  )
}

function ThemePreview({
  mode,
  selected,
  themeFamily,
}: {
  mode: AppearanceModeId
  selected: boolean
  themeFamily: ThemeFamilyId
}) {
  return (
    <div
      aria-hidden="true"
      className={`relative aspect-[8/5] w-full overflow-hidden rounded-lg border-2 transition-colors ${
        selected
          ? "border-primary ring-2 ring-ring"
          : "border-border group-hover:border-ring"
      }`}
    >
      {mode === "system" ? (
        <>
          <ThemePreviewPane
            className="absolute inset-y-0 left-0 w-1/2"
            sceneClassName="left-0 w-[200%]"
            scheme="light"
            themeFamily={themeFamily}
          />
          <ThemePreviewPane
            className="absolute inset-y-0 right-0 w-1/2"
            sceneClassName="right-0 w-[200%]"
            scheme="dark"
            themeFamily={themeFamily}
          />
        </>
      ) : (
        <ThemePreviewPane
          className="absolute inset-0"
          sceneClassName="inset-x-0"
          scheme={mode}
          themeFamily={themeFamily}
        />
      )}
    </div>
  )
}

function ThemePreviewPane({
  className,
  sceneClassName,
  scheme,
  themeFamily,
}: {
  className: string
  sceneClassName: string
  scheme: Exclude<AppearanceModeId, "system">
  themeFamily: ThemeFamilyId
}) {
  return (
    <div
      className={`${scheme} overflow-hidden bg-background ${className}`}
      data-theme={themeFamily}
    >
      <div className={`absolute inset-y-0 ${sceneClassName}`}>
        <div className="absolute inset-y-0 left-0 w-[27%] border-r border-sidebar-border bg-sidebar" />
        <div className="absolute left-[13%] top-[13%] flex -translate-x-1/2 gap-1">
          <span className="size-1.5 rounded-full bg-muted-foreground" />
          <span className="size-1.5 rounded-full bg-muted-foreground" />
          <span className="size-1.5 rounded-full bg-muted-foreground" />
        </div>
        <div className="absolute left-[35%] top-[34%] grid w-[51%] gap-2">
          <span className="h-2 rounded-full bg-muted-foreground" />
          <span className="h-2 w-4/5 rounded-full bg-muted-foreground" />
          <span className="h-2 w-3/5 rounded-full bg-muted-foreground" />
        </div>
      </div>
    </div>
  )
}

function OfflineAccessSection() {
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
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
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
        <div className="flex shrink-0 gap-2">
          <input
            accept=".zip,application/zip"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              if (!file) return
              try {
                const results = await importRecoveryArchive(file)
                const failed = results.filter((result) => !result.success)
                if (failed.length) {
                  toast.error(`${failed.length} page(s) could not be imported.`)
                } else {
                  toast.success(`${results.length} page(s) imported and synced.`)
                }
              } catch (error) {
                toast.error(getApiErrorMessage(error))
              }
              event.target.value = ""
            }}
            ref={importInput}
            type="file"
          />
          <Button
            onClick={() => importInput.current?.click()}
            type="button"
            variant="outline"
          >
            <UploadIcon /> Import recovery
          </Button>
          <Button
            disabled={!manifest.workspaces.length}
            onClick={() => void removeAll()}
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
