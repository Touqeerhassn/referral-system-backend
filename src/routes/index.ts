import { Router } from 'express';
import businessRouter from './business.routes';
import campaignRouter from './campaign.routes';
import participantRouter from './participant.routes';

const router = Router();

// Mount all feature routers here
router.use('/businesses', businessRouter);
router.use('/campaigns', campaignRouter);
router.use('/participants', participantRouter);

// Future routes:
// router.use('/ledger', ledgerRouter);

export default router;
