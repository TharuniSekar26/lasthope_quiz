import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.routes.js';
import exploreRoutes from './routes/explore.routes.js';
import gameRoutes from './routes/game.routes.js';
import quizRoutes from './routes/quiz.routes.js';

export function createApp() {
  const app = express();

  // Behind Render's proxy, trust one hop so req.ip is the real visitor (rate limits are per IP).
  if (env.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGINS, credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  // Health checks for Render / uptime monitors (cheap: no database call).
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/explore', exploreRoutes);
  app.use('/api/quizzes', quizRoutes);
  app.use('/api/games', gameRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
