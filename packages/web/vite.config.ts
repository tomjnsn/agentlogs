import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'path'

// Custom plugin to add timestamps to Vite logs
const timestampLogger = (): Plugin => ({
  name: 'timestamp-logger',
  configureServer(server) {
    const originalPrint = server.config.logger.info;
    server.config.logger.info = (msg, options) => {
      originalPrint(`[${new Date().toISOString()}] ${msg}`, options);
    };
  },
});

export default defineConfig({
  plugins: [
    timestampLogger(),
    tanstackStart(),
    react(),
    tsconfigPaths(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3001,
  },
})
