import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./components/App.js";
import { applyTheme, getCurrentTheme } from "./theme.js";
import { applyAvatarShape, getCurrentAvatarShape } from "./avatarShape.js";
import { applyComposerStyle, getCurrentComposerStyle } from "./composerStyle.js";
import "./types.js";

// Apply the saved theme before React renders so we don't flash the wrong palette.
applyTheme(getCurrentTheme());
applyAvatarShape(getCurrentAvatarShape());
applyComposerStyle(getCurrentComposerStyle());

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");
createRoot(root).render(<App />);
