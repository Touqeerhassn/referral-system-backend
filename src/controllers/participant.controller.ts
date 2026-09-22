import { Request, Response } from 'express';
import { nanoid } from 'nanoid';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { participants, campaigns } from '../db/schema';
import { asyncHandler } from '../middleware/errorHandler';

/**
 * POST /api/participants/join
 * Join a campaign directly or via a referral code.
 * Body is already validated + sanitised by Joi middleware.
 */
export const joinCampaign = asyncHandler(async (req: Request, res: Response) => {
    const { campaignId, name, phone, incomingRefCode } = req.body;

    // 1. Verify campaign exists
    const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

    if (!campaign) {
        res.status(404).json({ success: false, error: `Campaign "${campaignId}" not found` });
        return;
    }

    // 2. Verify campaign is still active
    const now = new Date();
    if (now < campaign.startDateTime!) {
        res.status(400).json({ success: false, error: 'This campaign has not started yet' });
        return;
    }
    if (now > campaign.endDateTime!) {
        res.status(400).json({ success: false, error: 'This campaign has ended' });
        return;
    }

    // 3. Resolve referrer if a code was supplied
    let parentId: string | null = null;
    if (incomingRefCode) {
        const [referrer] = await db
            .select()
            .from(participants)
            .where(
                and(
                    eq(participants.campaignId, campaignId),
                    eq(participants.referralCode, incomingRefCode)
                )
            )
            .limit(1);

        if (!referrer) {
            res.status(404).json({ success: false, error: `Referral code "${incomingRefCode}" is not valid for this campaign` });
            return;
        }

        if (referrer.phone === phone) {
            res.status(400).json({ success: false, error: 'Self-referrals are not permitted' });
            return;
        }

        parentId = referrer.id;
    }

    // 4. Generate a unique personal referral code: e.g. ALI-X7K2P
    const prefix = name.trim().slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X').padEnd(3, 'X');
    const personalCode = `${prefix}-${nanoid(5).toUpperCase()}`;

    // 5. Insert participant (DB unique index on campaignId+phone handles duplicate joins)
    let newParticipant;
    try {
        [newParticipant] = await db
            .insert(participants)
            .values({
                id: `part_${nanoid(10)}`,
                campaignId,
                name: name.trim(),
                phone,
                referralCode: personalCode,
                referredById: parentId,
                orderStatus: 'pending',
            })
            .returning();
    } catch (err: any) {
        // PostgreSQL unique violation
        if (err.code === '23505') {
            res.status(409).json({
                success: false,
                error: 'This phone number has already joined this campaign',
            });
            return;
        }
        throw err; // re-throw anything else to global error handler
    }

    res.status(201).json({
        success: true,
        message: 'Participant registered successfully',
        participant: newParticipant,
        shareableLink: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/c/${campaign.slug}?ref=${newParticipant.referralCode}`,
    });
});
