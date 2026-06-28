import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const userAgent = navigator.userAgent.toLowerCase();
document.documentElement.dataset.platform = userAgent.includes("windows")
  ? "windows"
  : userAgent.includes("mac")
    ? "macos"
    : "linux";

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
