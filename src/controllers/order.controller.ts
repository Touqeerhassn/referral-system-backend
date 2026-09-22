import { Request, Response } from 'express';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { participants, campaigns, referralLedger } from '../db/schema';
import { asyncHandler } from '../middleware/errorHandler';

/**
 * PATCH /api/participants/:id/confirm
 *
 * Called by the business owner after verifying the participant's payment
 * through their own external method (cash, bank transfer, etc.).
 *
 * On confirmation:
 *  1. Validates participant exists and is not already confirmed
 *  2. Fetches campaign to get tier discount rates
 *  3. Walks up the referral chain (max 3 tiers)
 *  4. Atomically updates participant + inserts all ledger rewards via db.batch()
 */
export const confirmOrder = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const { id: participantId } = req.params;

    // ── 1. Fetch buyer ───────────────────────────────────────────────────────
    const [buyer] = await db
        .select()
        .from(participants)
        .where(eq(participants.id, participantId))
        .limit(1);

    if (!buyer) {
        res.status(404).json({ success: false, error: 'Participant not found' });
        return;
    }

    if (buyer.orderStatus === 'confirmed') {
        res.status(400).json({ success: false, error: 'Order is already confirmed' });
        return;
    }

    // ── 2. Fetch campaign (with existence guard) ─────────────────────────────
    const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, buyer.campaignId))
        .limit(1);

    if (!campaign) {
        res.status(404).json({ success: false, error: 'Associated campaign not found' });
        return;
    }

    const tierRates: Record<number, number> = {
        1: campaign.tier1Pct ?? 20,
        2: campaign.tier2Pct ?? 10,
        3: campaign.tier3Pct ?? 5,
    };

    // ── 3. Walk the referral chain, collecting ancestors ────────────────────
    //
    // Each tier requires knowing the previous tier's referredById,
    // so sequential fetches are unavoidable here (max 3 DB calls).
    // We collect all rewards first, then insert in ONE batch.
    //
    // Chain direction: buyer → parent(T1) → grandparent(T2) → great-gp(T3)

    type LedgerPayload = {
        id: string;
        campaignId: string;
        beneficiaryId: string;
        triggerParticipantId: string;
        tierLevel: number;
        discountPercent: number;
        status: string;
    };

    const ledgerPayloads: LedgerPayload[] = [];
    let currentParentId: string | null = buyer.referredById;
    let currentTier = 1;

    while (currentParentId && currentTier <= 3) {
        const discount = tierRates[currentTier];

        if (discount > 0) {
            ledgerPayloads.push({
                id: `led_${nanoid(10)}`,
                campaignId: buyer.campaignId,
                beneficiaryId: currentParentId,
                triggerParticipantId: buyer.id,
                tierLevel: currentTier,
                discountPercent: discount,
                status: 'confirmed',
            });
        }

        // Fetch only the referredById of the current ancestor to move up the chain
        const [ancestor] = await db
            .select({ referredById: participants.referredById })
            .from(participants)
            .where(eq(participants.id, currentParentId))
            .limit(1);

        currentParentId = ancestor?.referredById ?? null;
        currentTier++;
    }

    // ── 4. Atomically commit: update participant + insert all ledger rows ────
    //
    // neon-http does not support db.transaction(), but db.batch() sends all
    // queries in a single HTTP round-trip and Neon executes them atomically.

    const updateQuery = db
        .update(participants)
        .set({ orderStatus: 'confirmed' })
        .where(eq(participants.id, participantId))
        .returning();

    if (ledgerPayloads.length > 0) {
        // Batch: [update participant, insert all ledger entries] — one round-trip
        const insertQuery = db
            .insert(referralLedger)
            .values(ledgerPayloads)
            .returning();

        const [updateResult, ledgerResult] = await db.batch([updateQuery, insertQuery]);

        res.json({
            success: true,
            message: 'Order confirmed and referral rewards distributed',
            participant: updateResult[0],
            rewards: ledgerResult,
        });
    } else {
        // Buyer had no referrer — no chain to walk, just confirm the order
        const [updatedParticipant] = await updateQuery;

        res.json({
            success: true,
            message: 'Order confirmed — no referral chain to reward',
            participant: updatedParticipant,
            rewards: [],
        });
    }
});

/**
 * GET /api/participants/:id/summary
 *
 * Customer dashboard: returns the participant's accumulated discount progress.
 *
 * Response includes:
 *  - participant record
 *  - metrics: totalEarnedPct, applicableDiscountPct (capped), maxDiscountCapPct,
 *             directReferrals (tier 1), indirectReferrals (tier 2+)
 *  - ledgerDetails: every confirmed reward row earned by this participant
 */
export const getParticipantSummary = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;

    // ── 1. Fetch participant ─────────────────────────────────────────────────
    const [participant] = await db
        .select()
        .from(participants)
        .where(eq(participants.id, id))
        .limit(1);

    if (!participant) {
        res.status(404).json({ success: false, error: 'Participant not found' });
        return;
    }

    // ── 2. Fetch campaign for the discount cap ───────────────────────────────
    const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, participant.campaignId))
        .limit(1);

    const maxCap = campaign?.maxDiscountCapPct ?? 50;

    // ── 3. Fetch all ledger rows where this participant is the beneficiary ───
    const rewards = await db
        .select()
        .from(referralLedger)
        .where(eq(referralLedger.beneficiaryId, id));

    // ── 4. Compute metrics ───────────────────────────────────────────────────
    const totalRawDiscount = rewards.reduce((sum, row) => sum + row.discountPercent, 0);
    const applicableDiscount = Math.min(totalRawDiscount, maxCap);

    res.json({
        success: true,
        participant,
        metrics: {
            totalEarnedPct: totalRawDiscount,
            applicableDiscountPct: applicableDiscount,
            maxDiscountCapPct: maxCap,
            directReferrals: rewards.filter(r => r.tierLevel === 1).length,
            indirectReferrals: rewards.filter(r => r.tierLevel > 1).length,
        },
        ledgerDetails: rewards,
    });
});
