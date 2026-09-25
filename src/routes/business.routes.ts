import { Router } from 'express';
import { registerBusiness, getBusinessCampaigns } from '../controllers/business.controller';
import { validate } from '../middleware/validate';
import { registerBusinessSchema, businessParamsSchema } from '../validators/business.validator';

const router = Router();

// POST /api/businesses/register — Register a new business
router.post('/register', validate(registerBusinessSchema), registerBusiness);

// GET /api/businesses/:businessId/campaigns — Get all campaigns for a business
router.get('/:businessId/campaigns', validate(businessParamsSchema, 'params'), getBusinessCampaigns);

export default router;


