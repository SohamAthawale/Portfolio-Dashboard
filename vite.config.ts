import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Export the configuration
export default defineConfig({
  // 1️⃣ Add React plugin
  plugins: [react()],
  // This lets Vite understand React’s JSX syntax and Fast Refresh

  // 2️⃣ Optimize dependencies
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  // Excluding some packages can speed up builds or prevent bundling conflicts

  // 3️⃣ Local development server config
server: {
  proxy: {
    '/login': 'http://127.0.0.1:5000',
    '/register': 'http://127.0.0.1:5000',
    '/upload': 'http://127.0.0.1:5000',
    '/dashboard-data': 'http://127.0.0.1:5000',
    '/history-data': 'http://127.0.0.1:5000',
  },
},

  // This tells Vite: “if you see any request that starts with /login or /upload,
  // don’t try to handle it here — forward it to Flask running on port 5000.”
  // ✅ It removes CORS issues in development

  // 4️⃣ Build settings (optional)
  build: {
    outDir: 'dist',
  },
  // When you build your app, Vite puts all optimized files in /dist
});
