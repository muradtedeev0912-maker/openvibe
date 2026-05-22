import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "renderer",
  base: "./",
  plugins: [react()],
  publicDir: "public",
  build: {
    outDir: "../dist/renderer",
    emptyOutDir: true,
    copyPublicDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 3000,
    strictPort: true,
  },
});
