import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initializeDesktopAuthToken } from "@/lib/desktop-auth-token";
import {
  installDesktopDiagnostics,
  markDesktopAppReady,
  markDesktopRootMounted,
  recordDesktopDiagnostic,
} from "@/lib/desktop-diagnostics";
import { AppProviders } from "@/providers/app-providers";
import "./App.css";
import "@/packages/editor/styles.css";

installDesktopDiagnostics();
recordDesktopDiagnostic("renderer.auth_initialization", { status: "started" });

void initializeDesktopAuthToken().finally(() => {
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
});

function DesktopStartupMarker({ phase }: { phase: "app" | "root" }) {
  React.useEffect(() => {
    if (phase === "root") markDesktopRootMounted()
    else markDesktopAppReady()
  }, [phase])

  return null
}
