import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Reuse the editor in a static entrypoint so GitHub Pages needs no server.
export default defineConfig({
  root: "site",
  base: process.env.GALLERY_BASE_PATH || "/parallax-studio/",
  publicDir: "../public",
  plugins: [react()],
  build: { outDir: "../dist-pages", emptyOutDir: true },
});
