import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import * as ctrl from '../controllers/quiz.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { generateSchema, publishSchema, quizSchema } from '../validators/quiz.validators.js';

const router = Router();

router.use(requireAuth); // hosts only

// Per-host quotas for the paid AI call. Keyed by user id, not IP, and failed requests
// (validation errors, provider outages) are not counted against the quota.
const aiLimiter = (windowMs, limit, label) =>
  rateLimit({
    windowMs,
    limit,
    keyGenerator: (req) => req.userId,
    skipFailedRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: `AI generation limit reached (${limit} per ${label}). Please try again later.` },
  });
const aiHourly = aiLimiter(60 * 60 * 1000, env.AI_LIMIT_PER_HOUR, 'hour');
const aiDaily = aiLimiter(24 * 60 * 60 * 1000, env.AI_LIMIT_PER_DAY, 'day');

// Declared before the /:id routes. Validation runs first so malformed requests cost no quota.
router.post('/generate', validate(generateSchema), aiHourly, aiDaily, ctrl.generate);

// Duplicating creates documents, so cap it per user (failed attempts don't count).
const duplicateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => req.userId,
  skipFailedRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'You are duplicating quizzes too quickly. Please try again later.' },
});

router.get('/', ctrl.list);
router.post('/:id/duplicate', duplicateLimiter, ctrl.duplicate);
router.post('/', validate(quizSchema), ctrl.create);
router.get('/:id', ctrl.getOne);
router.put('/:id', validate(quizSchema), ctrl.update);
router.patch('/:id/publish', validate(publishSchema), ctrl.setPublished);
router.delete('/:id', ctrl.remove);

export default router;
