import { Router } from 'express';
import { joinCampaign, lookupParticipant } from '../controllers/participant.controller';
import { confirmOrder, getParticipantSummary } from '../controllers/order.controller';
import { validate } from '../middleware/validate';
import { joinCampaignSchema } from '../validators/participant.validator';
import { confirmOrderParamsSchema } from '../validators/order.validator';

const router = Router();

// POST /api/participants/join — Join a campaign (direct or via referral code)
router.post('/join', validate(joinCampaignSchema), joinCampaign);

// PATCH /api/participants/:id/confirm — Business owner confirms a participant's order
router.patch('/:id/confirm', validate(confirmOrderParamsSchema, 'params'), confirmOrder);

// GET /api/participants/:id/summary — Customer dashboard: accumulated discount progress
router.get('/:id/summary', validate(confirmOrderParamsSchema, 'params'), getParticipantSummary);

export default router;

// POST /api/participants/lookup - Lookup existing participant by phone, code, or ID
router.post('/lookup', lookupParticipant);
