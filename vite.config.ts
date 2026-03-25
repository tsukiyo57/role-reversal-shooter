import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    assetsDir: "assets",
  },
  server: {
    port: 5173,
    proxy: {
      "/comfy": {
        target: "http://localhost:8188",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/comfy/, ""),
        configure: (proxy) => {
          // ComfyUI rejects requests with non-localhost Origin header
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.removeHeader("origin");
            proxyReq.removeHeader("referer");
          });
        },
      },
    },
  },
});
