import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initializeDesktopAuthToken } from "@/features/desktop/auth/index";
import {
  applyActiveDesktopProfileWorkspace,
  initializeDesktopServer,
  listDesktopServerProfiles,
} from "@/features/desktop/server/index";
import { useAppStore } from "@/app/state/app-store";
import { useAuthFlowStore } from "@/features/auth";
import {
  installDesktopDiagnostics,
  markDesktopAppReady,
  markDesktopRootMounted,
  recordDesktopDiagnostic,
} from "@/features/desktop/diagnostics/index";
import { AppProviders } from "@/app/providers/app-providers";
import { initializeDesktopTranslucency } from "@/features/desktop/window/index";
import "../shared/styles/global.css";
import "./styles.css";

installDesktopDiagnostics();
void bootstrap();

async function bootstrap() {
  recordDesktopDiagnostic("renderer.server_initialization", {
    status: "started",
  });
  try {
    await initializeDesktopServer();
    recordDesktopDiagnostic("renderer.server_initialization", {
      status: "success",
    });
  } catch (error) {
    recordDesktopDiagnostic(
      "renderer.server_initialization",
      {
        error_type: error instanceof Error ? error.name : "unknown_error",
        status: "error",
      },
      "error",
    );
    renderStartupFailure(error);
    return;
  }

  recordDesktopDiagnostic("renderer.auth_initialization", {
    status: "started",
  });
  await initializeDesktopAuthToken();
  await initializeDesktopTranslucency().catch(() => {
    // Older desktop shells can continue at the default, fully opaque setting.
  });
  await Promise.all([
    useAppStore.persist.rehydrate(),
    useAuthFlowStore.persist.rehydrate(),
  ]);
  try {
    applyActiveDesktopProfileWorkspace(
      await listDesktopServerProfiles(),
      (workspaceId) => useAppStore.getState().setActiveWorkspaceId(workspaceId),
    )
  } catch {
    // Profiles are optional until the native list command is available.
  }
  recordDesktopDiagnostic("renderer.render_requested", { status: "started" });
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <DesktopStartupMarker phase="root" />
      <AppProviders>
        <DesktopStartupMarker phase="app" />
        <App />
      </AppProviders>
    </React.StrictMode>,
  );
}

function renderStartupFailure(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "The saved desktop server configuration could not be loaded.";
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="max-w-md space-y-4 rounded-lg border bg-card p-6 text-card-foreground">
        <h1 className="text-lg font-semibold">Zilobase could not start</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <button
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          onClick={() => window.location.reload()}
          type="button"
        >
          Try again
        </button>
      </div>
    </main>,
  );
}

function DesktopStartupMarker({ phase }: { phase: "app" | "root" }) {
  React.useEffect(() => {
    if (phase === "root") markDesktopRootMounted()
    else markDesktopAppReady()
  }, [phase])

  return null
}
