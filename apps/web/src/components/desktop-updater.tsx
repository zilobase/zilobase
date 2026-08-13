import { isTauri } from "@tauri-apps/api/core"
import type { Update } from "@tauri-apps/plugin-updater"
import { useEffect } from "react"
import { toast } from "sonner"
import {
  describeDesktopError,
  recordDesktopDiagnostic,
} from "@/lib/desktop-diagnostics"

let updateCheckStarted = false

export function DesktopUpdater() {
  useEffect(() => {
    if (!isTauri() || updateCheckStarted) return

    updateCheckStarted = true
    void checkForUpdate()
  }, [])

  return null
}

async function checkForUpdate() {
  const startedAt = performance.now()
  recordDesktopDiagnostic("updater.check", { status: "started" })
  try {
    const { check } = await import("@tauri-apps/plugin-updater")
    const update = await check()

    if (!update) {
      recordDesktopDiagnostic("updater.check", {
        duration_ms: performance.now() - startedAt,
        status: "success",
      })
      return
    }

    recordDesktopDiagnostic("updater.check", {
      duration_ms: performance.now() - startedAt,
      status: "success",
    })

    toast.info(`Zilobase ${update.version} is available`, {
      action: {
        label: "Update and restart",
        onClick: () => void installUpdate(update),
      },
      description: update.body || "Install the latest version and reopen Zilobase.",
      duration: Infinity,
    })
  } catch (error) {
    recordDesktopDiagnostic(
      "updater.check",
      {
        ...describeDesktopError(error),
        duration_ms: performance.now() - startedAt,
      },
      "error",
    )
    console.error("Could not check for a Zilobase update", error)
  }
}

async function installUpdate(update: Update) {
  const toastId = toast.loading("Downloading Zilobase update…")
  const startedAt = performance.now()
  recordDesktopDiagnostic("updater.install", { status: "started" })

  try {
    await update.downloadAndInstall()
    recordDesktopDiagnostic("updater.install", {
      duration_ms: performance.now() - startedAt,
      status: "success",
    })
    toast.loading("Restarting Zilobase…", { id: toastId })

    const { relaunch } = await import("@tauri-apps/plugin-process")
    await relaunch()
  } catch (error) {
    recordDesktopDiagnostic(
      "updater.install",
      {
        ...describeDesktopError(error),
        duration_ms: performance.now() - startedAt,
      },
      "error",
    )
    console.error("Could not install the Zilobase update", error)
    toast.error("Could not install the update.", {
      description: "Please try again later.",
      id: toastId,
    })
  }
}
