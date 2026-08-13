import * as React from "react"
import { invoke, isTauri } from "@tauri-apps/api/core"
import { useTheme } from "next-themes"
import {
  BugIcon,
  CheckIcon,
  DownloadIcon,
  FolderOpenIcon,
  HardDriveIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import { toast } from "sonner"

import { SettingsHeader } from "@/components/settings-header"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { getApiErrorMessage } from "@/lib/api"
import {
  describeDesktopError,
  recordDesktopDiagnostic,
} from "@/lib/desktop-diagnostics"
import {
  clearAllOfflineData,
  disableOfflineWorkspace,
  enableOfflineWorkspace,
  getConnectivityState,
  isDesktopOfflineSupported,
} from "@/lib/offline-store"
import { importRecoveryArchive } from "@/lib/offline-recovery"
import { queryClient } from "@/lib/query-client"
import { useOfflineManifest } from "@/providers/offline-provider"
import { useSession } from "@zilobase/features/auth"
import { useWorkspaces } from "@zilobase/features/workspaces"

const appearanceOptions = [
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
  { label: "System", value: "system" },
] as const

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
            <DiagnosticsSection />
          </>
        ) : null}
      </div>
    </main>
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

  return (
    <section className="grid gap-3">
      <div className="space-y-1">
        <h3 className="font-heading text-base font-medium">Appearance</h3>
        <p className="text-sm text-muted-foreground">
          Choose how Zilobase looks on this device.
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        {appearanceOptions.map((option) => {
          const selected = option.value === theme

          return (
            <button
              aria-pressed={selected}
              className="group relative grid w-40 gap-1.5 rounded-lg p-1 text-left text-sm font-medium outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/40 aria-pressed:bg-muted/70"
              key={option.value}
              onClick={() => setTheme(option.value)}
              type="button"
            >
              <ThemePreview mode={option.value} selected={selected} />
              <span className="flex items-center justify-between px-0.5">
                {option.label}
                {selected ? <CheckIcon className="size-4 text-primary" /> : null}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function ThemePreview({
  mode,
  selected,
}: {
  mode: (typeof appearanceOptions)[number]["value"]
  selected: boolean
}) {
  const isLight = mode === "light"
  const isDark = mode === "dark"

  return (
    <div
      className={`relative aspect-[8/5] w-full overflow-hidden rounded-lg border-2 transition-colors ${
        selected
          ? "border-primary ring-2 ring-primary/15"
          : "border-border group-hover:border-foreground/25"
      } ${
        isLight
          ? "bg-zinc-100"
          : isDark
            ? "bg-zinc-900"
            : "bg-[linear-gradient(to_right,#f4f4f5_0%,#f4f4f5_50%,#18181b_50%,#18181b_100%)]"
      }`}
      aria-hidden="true"
    >
      <div
        className={`absolute inset-y-0 left-0 w-[27%] border-r ${
          isDark
            ? "border-zinc-700 bg-zinc-800"
            : "border-zinc-300 bg-white/80"
        }`}
      />
      <div className="absolute top-[13%] left-[13%] flex -translate-x-1/2 gap-1">
        <span className={`size-1.5 rounded-full ${isDark ? "bg-zinc-600" : "bg-zinc-300"}`} />
        <span className={`size-1.5 rounded-full ${isDark ? "bg-zinc-600" : "bg-zinc-300"}`} />
        <span className={`size-1.5 rounded-full ${isDark ? "bg-zinc-600" : "bg-zinc-300"}`} />
      </div>
      <div className="absolute top-[34%] left-[35%] grid w-[51%] gap-2">
        <span
          className={`h-2 rounded-full ${
            isLight ? "bg-zinc-300" : "bg-zinc-700"
          }`}
        />
        <span
          className={`h-2 w-4/5 rounded-full ${
            isLight ? "bg-zinc-300" : "bg-zinc-700"
          }`}
        />
        <span
          className={`h-2 w-3/5 rounded-full ${
            isLight ? "bg-zinc-300" : "bg-zinc-700"
          }`}
        />
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
