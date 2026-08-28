import react from "@vitejs/plugin-react";
import { defineConfig, type ProxyOptions } from "vite";

const backendProxy = {
  target: "http://[::1]:8765",
  bypass(request) {
    if (
      request.method === "GET" &&
      request.headers.accept?.includes("text/html")
    ) {
      return "/index.html";
    }
  },
} satisfies ProxyOptions;

export default defineConfig({
  plugins: [react()],
  base: "/",
  build: {
    outDir: "../src/ai_job_search/frontend_dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": backendProxy,
      "/applications": backendProxy,
      "/jobs": backendProxy,
      "/packages": backendProxy,
      "/profile": backendProxy,
      "/preferences": backendProxy,
    },
  },
});
