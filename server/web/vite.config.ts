/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Build output goes straight into the Go server's static dir, under /app — the
// Go binary serves it as-is on its own port, no separate frontend process in
// production. Go serves this same bundle for "/", "/login" and
// "/change-password"; client-side routing (react-router-dom) decides the screen.
export default defineConfig({
  plugins: [react()],
  base: "/static/app/",
  build: {
    outDir: "../static/app",
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
  server: {
    // Toda a API (sessão e secret key) vive sob /api desde a reestruturação de rotas
    // (server/CLAUDE.md, "Separação API vs SPA") — um único proxy substitui a lista antiga
    // de paths bare (/auth, /applications, /teams...), que ficou obsoleta e quebrada com
    // essa mudança (o dev server via `make web-dev` proxeava pro shape errado).
    proxy: {
      "/api": "http://localhost:3056",
      "/health": "http://localhost:3056",
      "/ready": "http://localhost:3056",
    },
  },
});
