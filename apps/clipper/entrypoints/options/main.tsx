import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../../assets/clipper.css";
import { OptionsApp } from "./app";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OptionsApp />
  </StrictMode>,
);
