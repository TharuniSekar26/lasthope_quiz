import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // A production build without VITE_API_URL would silently talk to the wrong server, so fail the
  // build with a clear message instead (this is what you'd see in the Vercel build log).
  if (mode === 'production') {
    const apiUrl = loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL?.trim();
    if (!apiUrl || !/^https?:\/\//i.test(apiUrl)) {
      throw new Error('VITE_API_URL must be set for production builds, e.g. https://your-api.onrender.com/api');
    }
    if (apiUrl.startsWith('http://') && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(apiUrl)) {
      console.warn('\n[warn] VITE_API_URL uses http://. Browsers block this from an https site; use https://.\n');
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    server: { port: 5173 },
  };
});
