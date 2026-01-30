import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  optimizeDeps: {
    exclude: ['lucide-react'],
  },

  server: {
    proxy: {
      '/pmsreports': {
        target: 'http://127.0.0.1:8010',
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: 'dist',
  },
});
