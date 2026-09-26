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

    // ── Pre-flight Check: Does slug already exist? ───────────────────────────
    const [existingCampaign] = await db
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(eq(campaigns.slug, slug))
        .limit(1);

    if (existingCampaign) {
        res.status(409).json({
            success: false,
            error: `A campaign with slug "${slug}" already exists. Please choose a different slug.`,
            field: 'slug',
        });
        return;
    }

    let newCampaign;
    try {
        [newCampaign] = await db
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
    } catch (err: any) {
        // PostgreSQL unique violation on slug (handling direct code, cause, or wrapped message)
        const isDuplicate =
            err?.code === '23505' ||
            err?.cause?.code === '23505' ||
            err?.message?.includes('23505') ||
            err?.cause?.message?.includes('23505') ||
            err?.message?.includes('unique constraint') ||
            err?.cause?.message?.includes('unique constraint');

        if (isDuplicate) {
            res.status(409).json({
                success: false,
                error: `A campaign with slug "${slug}" already exists. Please choose a different slug.`,
                field: 'slug',
            });
            return;
        }
        throw err; // re-throw anything else to global error handler
    }


    res.status(201).json({
        success: true,
        message: 'Campaign created successfully',
        campaign: newCampaign,
        publicLink: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/c/${newCampaign!.slug}`,
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


/**
 * GET /api/campaigns/by-slug/:slug
 * Public endpoint: Returns campaign details by slug for public landing page
 */
export const getCampaignBySlug = asyncHandler(async (req: Request<{ slug: string }>, res: Response) => {
    const { slug } = req.params;

    const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.slug, slug))
        .limit(1);

    if (!campaign) {
        res.status(404).json({ success: false, error: `Campaign with slug "${slug}" not found` });
        return;
    }

    res.json({
        success: true,
        campaign,
    });
});


/**
 * GET /api/campaigns/:campaignId
 * Fetch single campaign details by ID.
 */
export const getCampaignById = asyncHandler(async (req: Request<{ campaignId: string }>, res: Response) => {
    const { campaignId } = req.params;

    const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

    if (!campaign) {
        res.status(404).json({ success: false, error: 'Campaign not found' });
        return;
    }

    res.json({
        success: true,
        campaign,
    });
});
