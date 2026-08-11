import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initializeDesktopAuthToken } from "@/lib/desktop-auth-token";
import { AppProviders } from "@/providers/app-providers";
import "./App.css";
import "@/packages/editor/styles.css";

void initializeDesktopAuthToken().finally(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <AppProviders>
        <App />
      </AppProviders>
    </React.StrictMode>,
  );
});
