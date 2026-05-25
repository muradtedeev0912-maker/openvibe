import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./components/App.js";
import { applyTheme, getCurrentTheme } from "./theme.js";
import "./types.js";

// Apply the saved theme before React renders so we don't flash the wrong palette.
applyTheme(getCurrentTheme());
// IDE style is fixed to "modern" — there's no longer a user toggle.
document.documentElement.setAttribute("data-ide-style", "modern");
// Composer is always rendered in expanded layout.
document.documentElement.setAttribute("data-composer-style", "expanded");

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");
createRoot(root).render(<App />);
