import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./": assets are loaded over file:// inside Electron.
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { port: 5174, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
});
