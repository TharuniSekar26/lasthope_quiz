// Where the backend lives. Set VITE_API_URL at build time (Vercel: Project Settings -> Environment Variables).
//   VITE_API_URL     the API, e.g. https://my-api.onrender.com/api  ("/api" is added if you leave it off)
//   VITE_SOCKET_URL  optional; defaults to the same host as the API
// In local development (`npm run dev`) it falls back to http://localhost:5000. Production builds
// have no fallback: vite.config.js refuses to build without VITE_API_URL.
const trim = (url) => (url ?? '').trim().replace(/\/+$/, '');

const configured = trim(import.meta.env.VITE_API_URL) || (import.meta.env.DEV ? 'http://localhost:5000/api' : '');
const origin = configured.replace(/\/api$/, '');

export const API_URL = `${origin}/api`;
export const SOCKET_URL = trim(import.meta.env.VITE_SOCKET_URL) || origin;
