import { Router } from 'express';
import { registerBusiness } from '../controllers/business.controller';
import { validate } from '../middleware/validate';
import { registerBusinessSchema } from '../validators/business.validator';

const router = Router();

// POST /api/businesses/register — Register a new business
router.post('/register', validate(registerBusinessSchema), registerBusiness);

export default router;

