import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as ctrl from '../controllers/game.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { bulkReportsSchema, createGameSchema, renameReportSchema } from '../validators/game.validators.js';

const router = Router();

// Public PIN lookups are throttled so PINs can't be enumerated.
const pinLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please slow down' },
});

router.post('/', requireAuth, validate(createGameSchema), ctrl.create);

// Reports (finished games). Declared before /:pin so "reports" isn't read as a PIN.
router.get('/reports', requireAuth, ctrl.listReports);
router.post('/reports/bulk', requireAuth, validate(bulkReportsSchema), ctrl.bulkReports);
router.get('/reports/:id', requireAuth, ctrl.getReport);
router.get('/reports/:id/download', requireAuth, ctrl.downloadReport);
router.patch('/reports/:id', requireAuth, validate(renameReportSchema), ctrl.renameReport);

router.get('/:id/results', requireAuth, ctrl.results);
router.get('/:pin', pinLimiter, ctrl.info);

export default router;
