import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppProviders } from "@/providers/app-providers";
import "./App.css";
import "@/packages/editor/styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </React.StrictMode>,
);
