import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as explore from '../services/explore.service.js';
import { exploreQuerySchema } from '../validators/quiz.validators.js';

// Public, unauthenticated, read-only. Throttled per IP.
const router = Router();
router.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests, please slow down' },
  })
);

router.get('/categories', async (_req, res) => {
  res.json({ categories: await explore.categoryCounts() });
});

router.get('/', async (req, res) => {
  res.json(await explore.listLibrary(exploreQuerySchema.parse(req.query)));
});

router.get('/:id', async (req, res) => {
  res.json(await explore.previewQuiz(req.params.id));
});

export default router;
