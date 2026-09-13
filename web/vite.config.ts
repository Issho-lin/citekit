import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes, req) => {
            const url = req.url || "";
            if (url.includes("/stream") || proxyRes.headers["content-type"]?.includes("text/event-stream")) {
              proxyRes.headers["cache-control"] = "no-cache, no-transform";
              proxyRes.headers["x-accel-buffering"] = "no";
            }
          });
        },
      },
      "/mcp": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
  optimizeDeps: {
    include: ["docx-preview", "nprogress"],
  },
});
