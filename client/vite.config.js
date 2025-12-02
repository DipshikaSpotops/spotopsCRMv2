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
          manualChunks: (id) => {
            // Node modules chunking
            if (id.includes("node_modules")) {
              // React Router - check FIRST and bundle with React (critical for v7)
              if (id.includes("react-router")) {
                return "react-vendor";
              }
              // React and React DOM - bundle together with React Router
              if (id.includes("/react/") || id.includes("/react-dom/") || 
                  (id.includes("react") && !id.includes("react-redux") && !id.includes("react-chartjs"))) {
                return "react-vendor";
              }
              // Redux
              if (id.includes("redux") || id.includes("@reduxjs")) {
                return "redux-vendor";
              }
              // Chart libraries
              if (id.includes("chart.js") || id.includes("react-chartjs-2") || id.includes("recharts")) {
                return "charts-vendor";
              }
              // Date libraries
              if (id.includes("date-fns") || id.includes("moment") || id.includes("dayjs")) {
                return "date-vendor";
              }
              // PDF/Canvas libraries
              if (id.includes("jspdf") || id.includes("html2canvas")) {
                return "pdf-vendor";
              }
              // Socket.IO
              if (id.includes("socket.io")) {
                return "socket-vendor";
              }
              // FontAwesome
              if (id.includes("fontawesome")) {
                return "icons-vendor";
              }
              // Other large vendor libraries
              if (id.includes("axios")) {
                return "http-vendor";
              }
              // All other node_modules
              return "vendor";
            }
          },
        },
      },
    },
  };
});
