import 'dotenv/config';
import { z } from 'zod';

// Validate environment once at boot so misconfiguration fails fast.
const schema = z.object({
  PORT: z.coerce.number().int().positive().default(5000),
  // Browser origin(s) allowed to call the API and Socket.IO, e.g. https://my-app.vercel.app
  // Several can be comma-separated. CLIENT_ORIGIN is the old name and still works.
  CLIENT_URL: z.string().optional(),
  CLIENT_ORIGIN: z.string().optional(),
  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  NODE_ENV: z.string().default('development'),

  // AI quiz generation. Without a key the feature responds 503 and the rest of the app is unaffected.
  GEMINI_API_KEY: z.string().optional().transform((v) => v?.trim() || undefined),
  // "gemini-flash-latest" is Google's alias for the current Flash model; pin a specific model to avoid silent upgrades.
  GEMINI_MODEL: z.string().optional().transform((v) => v?.trim() || 'gemini-flash-latest'),
  // Used automatically when the main model is overloaded, over quota or times out. Set to "off" to disable.
  GEMINI_FALLBACK_MODEL: z
    .string()
    .optional()
    .transform((v) => {
      const m = v?.trim();
      if (!m) return 'gemini-flash-lite-latest';
      return ['off', 'none'].includes(m.toLowerCase()) ? undefined : m;
    }),
  // Give up on a stuck Gemini call after this long, so the host gets a clear error instead of a hung page.
  GEMINI_TIMEOUT_MS: z.coerce.number().int().min(1000).default(45000),
  // Optional override of the Gemini endpoint (corporate proxy, or the local fake used by the tests).
  GEMINI_BASE_URL: z.string().optional().transform((v) => v?.trim() || undefined),
  // Per-user cost control (in-memory counters; they reset when the server restarts).
  AI_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(10),
  AI_LIMIT_PER_DAY: z.coerce.number().int().positive().default(30),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const data = parsed.data;
const production = data.NODE_ENV === 'production';

// Normalise the allowed origins: scheme + host (+ port) only, so a trailing slash or path in
// the variable can't cause the "CORS origin mismatch" that browsers report.
function fail(message) {
  console.error('Invalid environment configuration:');
  console.error(`  - ${message}`);
  process.exit(1);
}
const rawOrigins = data.CLIENT_URL?.trim() || data.CLIENT_ORIGIN?.trim() || (production ? '' : 'http://localhost:5173');
if (!rawOrigins) fail('CLIENT_URL is required in production (your frontend URL, e.g. https://my-app.vercel.app)');
let origins;
try {
  origins = [
    ...new Set(
      rawOrigins
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const url = new URL(s);
          if (!['http:', 'https:'].includes(url.protocol)) throw new Error('bad protocol');
          return url.origin;
        })
    ),
  ];
} catch {
  fail('CLIENT_URL must be full URLs such as https://my-app.vercel.app (comma-separate several)');
}

export const env = {
  ...data,
  CLIENT_ORIGINS: origins,
  // True when running behind a reverse proxy (Render sets RENDER=true). Needed so rate limits
  // see each visitor's real IP instead of the proxy's.
  TRUST_PROXY: production || !!process.env.RENDER,
};
