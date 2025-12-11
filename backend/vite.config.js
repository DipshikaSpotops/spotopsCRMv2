import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: "bundle-report.html",
      open: true,
      gzipSize: true,
      brotliSize: true,
    })
  ],
    resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
      },
       fs: {
      allow: [".."], 
    },
    },
  },
  build: {
    target: "esnext",
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React core
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react-vendor';
          }
          
          // React Router
          if (id.includes('node_modules/react-router')) {
            return 'router';
          }
          
          // Redux
          if (id.includes('node_modules/@reduxjs') || id.includes('node_modules/react-redux')) {
            return 'redux';
          }
          
          // Chart libraries
          if (id.includes('node_modules/chart.js') || 
              id.includes('node_modules/react-chartjs-2') || 
              id.includes('node_modules/recharts')) {
            return 'charts';
          }
          
          // Date libraries
          if (id.includes('node_modules/date-fns') || 
              id.includes('node_modules/dayjs') || 
              id.includes('node_modules/moment')) {
            return 'date-utils';
          }
          
          // Date picker components
          if (id.includes('node_modules/react-datepicker') || 
              id.includes('node_modules/react-date-range')) {
            return 'date-pickers';
          }
          
          // PDF/Canvas libraries
          if (id.includes('node_modules/jspdf') || 
              id.includes('node_modules/html2canvas')) {
            return 'pdf-utils';
          }
          
          // Socket.io
          if (id.includes('node_modules/socket.io-client')) {
            return 'socket';
          }
          
          // Axios
          if (id.includes('node_modules/axios')) {
            return 'http-client';
          }
          
          // Bootstrap
          if (id.includes('node_modules/bootstrap')) {
            return 'bootstrap';
          }
          
          // Font Awesome
          if (id.includes('node_modules/@fortawesome')) {
            return 'icons';
          }
          
          // React Icons
          if (id.includes('node_modules/react-icons')) {
            return 'react-icons';
          }
          
          // Other node_modules
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
  },
});
