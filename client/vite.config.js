import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: "bundle-report.html",
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@spotops/shared": fileURLToPath(new URL("../shared", import.meta.url)),
    },
  },

  //moment-timezone from shared gets pre-bundled cleanly
  optimizeDeps: {
    include: ["moment-timezone"],
  },
  server: {
    proxy: {
      "/api": {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    target: "esnext",
    sourcemap: false,
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          vendor: ["axios"], 
          charts: ["chart.js"], 
        },
      },
    },
  },
});
