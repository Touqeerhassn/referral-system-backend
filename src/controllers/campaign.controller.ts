import { Request, Response } from 'express';
import { nanoid } from 'nanoid';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { campaigns, businesses, referralLedger, participants } from '../db/schema';
import { asyncHandler } from '../middleware/errorHandler';


/**
 * POST /api/campaigns
 * Create a new campaign for a business.
 * Body is already validated + sanitised by Joi middleware.
 */
export const createCampaign = asyncHandler(async (req: Request, res: Response) => {
    const {
        businessId,
        name,
        slug,
        startDateTime,
        endDateTime,
        tier1Pct,
        tier2Pct,
        tier3Pct,
        maxDiscountCapPct,
    } = req.body;

    // Verify the referenced business actually exists
    const [business] = await db
        .select()
        .from(businesses)
        .where(eq(businesses.id, businessId))
        .limit(1);

    if (!business) {
        res.status(404).json({ success: false, error: `Business with id "${businessId}" not found` });
        return;
    }

    const [newCampaign] = await db
        .insert(campaigns)
        .values({
            id: `cmp_${nanoid(10)}`,
            businessId,
            name,
            slug,
            startDateTime: new Date(startDateTime),
            endDateTime: new Date(endDateTime),
            tier1Pct,
            tier2Pct,
            tier3Pct,
            maxDiscountCapPct,
        })
        .returning();

    res.status(201).json({
        success: true,
        message: 'Campaign created successfully',
        campaign: newCampaign,
        publicLink: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/c/${newCampaign.slug}`,
    });
});

/**
 * GET /api/campaigns/:campaignId/leaderboard
 *
 * Business owner dashboard: ranks participants by total discount earned
 * through referrals within a given campaign.
 *
 * Response includes per-participant:
 *  - participantId, participantName, phone
 *  - totalDiscountGiven: sum of all tier discounts earned
 *  - referralCount: number of confirmed referral events credited to them
 */
export const getCampaignLeaderboard = asyncHandler(async (req: Request<{ campaignId: string }>, res: Response) => {
    const { campaignId } = req.params;

    // ── 1. Guard: campaign must exist ────────────────────────────────────────
    const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

    if (!campaign) {
        res.status(404).json({ success: false, error: 'Campaign not found' });
        return;
    }

    // ── 2. Aggregate referral ledger, joined with participant names ───────────
    const leaderboard = await db
        .select({
            participantId: referralLedger.beneficiaryId,
            participantName: participants.name,
            phone: participants.phone,
            totalDiscountEarnedPct: sql<number>`SUM(${referralLedger.discountPercent})`,
            referralCount: sql<number>`COUNT(${referralLedger.id})`,
        })
        .from(referralLedger)
        .innerJoin(participants, eq(referralLedger.beneficiaryId, participants.id))
        .where(eq(referralLedger.campaignId, campaignId))
        .groupBy(referralLedger.beneficiaryId, participants.name, participants.phone)
        .orderBy(sql`SUM(${referralLedger.discountPercent}) DESC`);

    res.json({
        success: true,
        campaignId,
        leaderboard,
    });
});
