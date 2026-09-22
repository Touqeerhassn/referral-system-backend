import { Router } from 'express';
import { registerBusiness } from '../controllers/business.controller';
import { validate } from '../middleware/validate';
import { registerBusinessSchema } from '../validators/business.validator';

const router = Router();

// POST /api/businesses — Register a new business
router.post('/', validate(registerBusinessSchema), registerBusiness);

export default router;

