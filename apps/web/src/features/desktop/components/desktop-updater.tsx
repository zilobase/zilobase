import { desktopBridge, isDesktopApp } from "@/platform/desktop/native"
import { useEffect } from "react"
import { toast } from "sonner"
import {
  describeDesktopError,
  recordDesktopDiagnostic,
} from "../../../platform/diagnostics/desktop-diagnostics"

let updateCheckStarted = false

export function DesktopUpdater() {
  useEffect(() => {
    if (!isDesktopApp() || updateCheckStarted) return

    updateCheckStarted = true
    void checkForUpdate()
  }, [])

  return null
}

async function checkForUpdate() {
  const startedAt = performance.now()
  recordDesktopDiagnostic("updater.check", { status: "started" })
  try {
    const update = await desktopBridge().update.check()

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
        onClick: () => void installUpdate(),
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

async function installUpdate() {
  const toastId = toast.loading("Downloading Zilobase update…")
  const startedAt = performance.now()
  recordDesktopDiagnostic("updater.install", { status: "started" })

  try {
    await desktopBridge().update.download()
    recordDesktopDiagnostic("updater.install", {
      duration_ms: performance.now() - startedAt,
      status: "success",
    })
    toast.loading("Restarting Zilobase…", { id: toastId })

    await desktopBridge().update.installRestart()
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
