import { Router } from 'express';
import { createCampaign, getCampaignLeaderboard } from '../controllers/campaign.controller';
import { validate } from '../middleware/validate';
import { createCampaignSchema } from '../validators/campaign.validator';
import { campaignParamsSchema } from '../validators/order.validator';

const router = Router();

// POST /api/campaigns — Create a new campaign for a business
router.post('/', validate(createCampaignSchema), createCampaign);

// GET /api/campaigns/:campaignId/leaderboard — Business owner: ranked referral leaderboard
router.get('/:campaignId/leaderboard', validate(campaignParamsSchema, 'params'), getCampaignLeaderboard);

export default router;
