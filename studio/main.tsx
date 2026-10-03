import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Studio } from "./studio";
import "./styles.css";

const host = document.getElementById("studio");
if (!host) throw new Error("The page has no #studio to render into.");

createRoot(host).render(
  <StrictMode>
    <Studio />
  </StrictMode>,
);
