import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const shouldAnalyzeBundle = process.env.ANALYZE_BUNDLE === "true";

export default defineConfig(async () => {
  const plugins = [react()];

  if (shouldAnalyzeBundle) {
    const { visualizer } = await import("rollup-plugin-visualizer");
    plugins.push(
      visualizer({
        filename: "bundle-report.html",
        open: false,
        gzipSize: true,
        brotliSize: true,
      })
    );
  }

  return {
    plugins,
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
        "@spotops/shared": fileURLToPath(new URL("../shared", import.meta.url)),
      },
    },
    // moment-timezone from shared gets pre-bundled cleanly
    optimizeDeps: {
      include: ["moment-timezone"],
    },
    server: {
      proxy: {
        "/api": {
          target: "http://127.0.0.1:5000",
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
  };
});
