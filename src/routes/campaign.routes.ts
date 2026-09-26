import { Router } from 'express';
import { createCampaign, getCampaignLeaderboard, getCampaignBySlug, getCampaignById } from '../controllers/campaign.controller';
import { validate } from '../middleware/validate';
import { createCampaignSchema } from '../validators/campaign.validator';
import { campaignParamsSchema } from '../validators/order.validator';

const router = Router();

// POST /api/campaigns — Create a new campaign for a business
router.post('/', validate(createCampaignSchema), createCampaign);

// GET /api/campaigns/:campaignId/leaderboard — Business owner: ranked referral leaderboard
router.get('/:campaignId/leaderboard', validate(campaignParamsSchema, 'params'), getCampaignLeaderboard);

export default router;

// GET /api/campaigns/by-slug/:slug & /slug/:slug - Public campaign details by slug
router.get('/by-slug/:slug', getCampaignBySlug);
router.get('/slug/:slug', getCampaignBySlug);

// GET /api/campaigns/:campaignId - Single campaign details
router.get('/:campaignId', getCampaignById);
