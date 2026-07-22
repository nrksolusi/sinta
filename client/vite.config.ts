import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import mkcert from "vite-plugin-mkcert";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/paraglide",
    }),
    tailwindcss(),
    // Serves the dev server over HTTPS with a locally-trusted cert. iOS Safari
    // only exposes navigator.mediaDevices (the camera) in a secure context, so
    // the barcode scanner needs HTTPS when the phone reaches the dev server by
    // LAN IP rather than localhost.
    mkcert(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/v1": "http://localhost:8080",
    },
  },
  test: {
    setupFiles: ["./src/test-setup.ts"],
  },
});
