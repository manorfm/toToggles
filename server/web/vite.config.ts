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
    proxy: {
      "/auth": "http://localhost:3056",
      "/applications": "http://localhost:3056",
      "/teams": "http://localhost:3056",
      "/users": "http://localhost:3056",
      "/profile": "http://localhost:3056",
      "/secret-keys": "http://localhost:3056",
      "/approval": "http://localhost:3056",
      "/api": "http://localhost:3056",
      "/health": "http://localhost:3056",
      "/ready": "http://localhost:3056",
    },
  },
});
