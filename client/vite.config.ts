import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { loadEnv } from "vite";
import mkcert from "vite-plugin-mkcert";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Read the root .env (one level up) so the dev server shares the stack's
  // single config source. Only used here in Node; nothing is exposed to the
  // browser bundle (no VITE_-prefixed value is read).
  const env = loadEnv(mode, path.resolve(__dirname, ".."), "");
  const serverPort = env.PORT ?? "8080";
  const clientPort = Number(env.CLIENT_PORT ?? 3000);
  return {
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
      port: clientPort,
      proxy: {
        "/v1": `http://localhost:${serverPort}`,
      },
    },
    test: {
      setupFiles: ["./src/test-setup.ts"],
    },
  };
});
