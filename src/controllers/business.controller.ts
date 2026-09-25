import { Request, Response } from 'express';
import { nanoid } from 'nanoid';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { businesses, campaigns, participants } from '../db/schema';
import { asyncHandler } from '../middleware/errorHandler';

/**
 * POST /api/businesses/register
 * Register a business as Guest or Subscribed.
 * Request body is already validated + sanitised by Joi middleware.
 */
export const registerBusiness = asyncHandler(async (req: Request, res: Response) => {
    const { name, subsStatus } = req.body; // guaranteed valid by validate() middleware

    const [newBusiness] = await db
        .insert(businesses)
        .values({
            id: `biz_${nanoid(10)}`,
            name,
            subsStatus,
        })
        .returning();

    res.status(201).json({
        success: true,
        message: 'Business registered successfully',
        business: newBusiness,
    });
});

/**
 * GET /api/businesses/:businessId/campaigns
 * Get all campaigns belonging to a specific business.
 */
export const getBusinessCampaigns = asyncHandler(async (req: Request<{ businessId: string }>, res: Response) => {
    const { businessId } = req.params;

    // Verify the business exists
    const [business] = await db
        .select()
        .from(businesses)
        .where(eq(businesses.id, businessId))
        .limit(1);

    if (!business) {
        res.status(404).json({
            success: false,
            error: `Business with id "${businessId}" not found`,
        });
        return;
    }

    // Fetch all campaigns under this business, sorted newest first
    const businessCampaigns = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.businessId, businessId))
        .orderBy(desc(campaigns.createdAt));

    res.json({
        success: true,
        business: {
            id: business.id,
            name: business.name,
            subsStatus: business.subsStatus,
            createdAt: business.createdAt,
        },
        campaigns: businessCampaigns,
    });
});




/**
 * GET /api/businesses/:businessId/participants
 * Fetch all participants registered across all campaigns of a business.
 */
export const getBusinessParticipants = asyncHandler(async (req: Request<{ businessId: string }>, res: Response) => {
    const { businessId } = req.params;

    const [business] = await db
        .select()
        .from(businesses)
        .where(eq(businesses.id, businessId))
        .limit(1);

    if (!business) {
        res.status(404).json({
            success: false,
            error: `Business with id "${businessId}" not found`,
        });
        return;
    }

    const participantList = await db
        .select({
            id: participants.id,
            campaignId: participants.campaignId,
            campaignName: campaigns.name,
            campaignSlug: campaigns.slug,
            name: participants.name,
            phone: participants.phone,
            referralCode: participants.referralCode,
            referredById: participants.referredById,
            orderStatus: participants.orderStatus,
            createdAt: participants.createdAt,
        })
        .from(participants)
        .innerJoin(campaigns, eq(participants.campaignId, campaigns.id))
        .where(eq(campaigns.businessId, businessId))
        .orderBy(desc(participants.createdAt));

    res.json({
        success: true,
        participants: participantList,
    });
});
