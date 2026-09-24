import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../../assets/clipper.css";
import { PopupApp } from "./app";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>,
);
