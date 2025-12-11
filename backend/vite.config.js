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
          // Check if it's a node_modules dependency
          if (!id.includes('node_modules')) {
            // Split source code by feature/route
            if (id.includes('/src/pages/')) {
              return 'pages';
            }
            if (id.includes('/src/components/')) {
              return 'components';
            }
            if (id.includes('/src/layouts/')) {
              return 'layouts';
            }
            return null;
          }

          // React core - must be first to catch exact matches
          if (id.includes('node_modules/react/') && !id.includes('react-dom')) {
            return 'react-core';
          }
          if (id.includes('node_modules/react-dom')) {
            return 'react-dom';
          }
          
          // React Router - split router and history
          if (id.includes('node_modules/react-router')) {
            if (id.includes('history')) {
              return 'router-history';
            }
            return 'router';
          }
          
          // Redux - split toolkit and react-redux
          if (id.includes('node_modules/@reduxjs/toolkit')) {
            return 'redux-toolkit';
          }
          if (id.includes('node_modules/react-redux')) {
            return 'react-redux';
          }
          if (id.includes('node_modules/redux')) {
            return 'redux-core';
          }
          
          // React Icons - this is HUGE, split by icon set
          if (id.includes('node_modules/react-icons')) {
            if (id.includes('/fa/') || id.includes('/fa5/') || id.includes('/fa6/')) {
              return 'react-icons-fa';
            }
            if (id.includes('/md/') || id.includes('/md5/')) {
              return 'react-icons-md';
            }
            if (id.includes('/io/') || id.includes('/io5/')) {
              return 'react-icons-io';
            }
            return 'react-icons-other';
          }
          
          // Chart libraries - split each
          if (id.includes('node_modules/chart.js')) {
            return 'chartjs';
          }
          if (id.includes('node_modules/react-chartjs-2')) {
            return 'react-chartjs';
          }
          if (id.includes('node_modules/recharts')) {
            return 'recharts';
          }
          
          // Date libraries - split each
          if (id.includes('node_modules/date-fns')) {
            return 'date-fns';
          }
          if (id.includes('node_modules/dayjs')) {
            return 'dayjs';
          }
          if (id.includes('node_modules/moment')) {
            return 'moment';
          }
          
          // Date picker components
          if (id.includes('node_modules/react-datepicker')) {
            return 'react-datepicker';
          }
          if (id.includes('node_modules/react-date-range')) {
            return 'react-date-range';
          }
          
          // PDF/Canvas libraries
          if (id.includes('node_modules/jspdf')) {
            return 'jspdf';
          }
          if (id.includes('node_modules/html2canvas')) {
            return 'html2canvas';
          }
          
          // Socket.io
          if (id.includes('node_modules/socket.io-client')) {
            return 'socket-io';
          }
          
          // Axios
          if (id.includes('node_modules/axios')) {
            return 'axios';
          }
          
          // Bootstrap
          if (id.includes('node_modules/bootstrap')) {
            return 'bootstrap';
          }
          
          // Font Awesome
          if (id.includes('node_modules/@fortawesome')) {
            return 'fontawesome';
          }
          
          // Split remaining vendor by package name
          const match = id.match(/node_modules\/(@?[^/]+)/);
          if (match) {
            const packageName = match[1];
            // Group smaller packages together
            if (packageName.startsWith('@')) {
              return `vendor-${packageName.replace('@', '')}`;
            }
            return `vendor-${packageName}`;
          }
          
          return 'vendor-misc';
        },
      },
    },
  },
});
