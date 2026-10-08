import { Request, Response } from "express";
import { nanoid } from "nanoid";
import { eq, desc } from "drizzle-orm";
import { db } from "../db";
import { businesses, campaigns, participants, whatsappVerifications } from "../db/schema";
import { asyncHandler } from "../middleware/errorHandler";

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalisePhone(raw: string): string {
    return raw.startsWith("+") ? "+" + raw.replace(/\D/g, "") : raw.replace(/\D/g, "");
}

function generateNonce(): string {
    const digits = Math.floor(100000 + Math.random() * 900000);
    return `REF-${digits}`;
}

/** Beta token — swap for real jsonwebtoken in production */
function generateToken(businessId: string): string {
    const payload = Buffer.from(JSON.stringify({ sub: businessId, iat: Date.now() })).toString("base64");
    return `beta_${payload}`;
}

const WA_NUMBER = (process.env.WHATSAPP_BUSINESS_NUMBER || "0000000000").replace(/\D/g, "");

// ── Existing handlers ─────────────────────────────────────────────────────────

export const registerBusiness = asyncHandler(async (req: Request, res: Response) => {
    const { name, subsStatus } = req.body;
    const [newBusiness] = await db
        .insert(businesses)
        .values({ id: `biz_${nanoid(10)}`, name, subsStatus })
        .returning();
    res.status(201).json({ success: true, message: "Business registered successfully", business: newBusiness });
});

export const getBusinessCampaigns = asyncHandler(async (req: Request<{ businessId: string }>, res: Response) => {
    const { businessId } = req.params;
    const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
    if (!business) {
        res.status(404).json({ success: false, error: `Business "${businessId}" not found` });
        return;
    }
    const businessCampaigns = await db
        .select().from(campaigns).where(eq(campaigns.businessId, businessId)).orderBy(desc(campaigns.createdAt));
    res.json({ success: true, business, campaigns: businessCampaigns });
});

export const getBusinessParticipants = asyncHandler(async (req: Request<{ businessId: string }>, res: Response) => {
    const { businessId } = req.params;
    const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
    if (!business) {
        res.status(404).json({ success: false, error: `Business "${businessId}" not found` });
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
    res.json({ success: true, participants: participantList });
});

// ── WhatsApp Reverse Verification ─────────────────────────────────────────────

/**
 * POST /api/businesses/verify/initiate
 *
 * Creates a PENDING session and returns the wa.me deep-link.
 * The user opens WhatsApp -> taps Send -> our webhook fires -> account created.
 */
export const initiateWhatsAppVerify = asyncHandler(async (req: Request, res: Response) => {
    const { name, phone, email, role } = req.body;

    const claimedPhone = normalisePhone(phone);
    const nonce = generateNonce();
    const subsStatus = role === "subscriber" ? "Subscribed" : "Guest";
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    const codeText = `VERIFY_${nonce}`;
    const waLink = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(codeText)}`;

    await db.insert(whatsappVerifications).values({
        id: `wv_${nanoid(10)}`,
        nonce,
        claimedPhone,
        businessName: name.trim(),
        businessEmail: email?.trim() || null,
        subsStatus,
        status: "PENDING",
        expiresAt,
    });

    console.log(`[WA-Verify] Initiated | nonce=${nonce} | phone=${claimedPhone}`);

    res.status(201).json({
        success: true,
        nonce,
        waLink,
        expiresAt: Math.floor(expiresAt.getTime() / 1000),
        message: "Verification session created. Open WhatsApp to confirm your number.",
    });
});

/**
 * GET /api/businesses/verify/status?nonce=REF-849201
 *
 * Frontend polls this every 2 seconds.
 * Returns { status: "PENDING" | "VERIFIED" | "EXPIRED", token?, business? }
 */
export const checkVerifyStatus = asyncHandler(async (req: Request, res: Response) => {
    const { nonce } = req.query as { nonce: string };

    const [session] = await db
        .select()
        .from(whatsappVerifications)
        .where(eq(whatsappVerifications.nonce, nonce))
        .limit(1);

    if (!session) {
        res.status(404).json({ success: false, error: "Verification session not found. Please register again." });
        return;
    }

    // Auto-expire if TTL passed
    if (session.status === "PENDING" && new Date() > session.expiresAt) {
        await db.update(whatsappVerifications).set({ status: "EXPIRED" }).where(eq(whatsappVerifications.nonce, nonce));
        res.json({ status: "EXPIRED", message: "Verification code has expired." });
        return;
    }

    if (session.status === "PENDING") {
        res.json({ status: "PENDING", message: "Waiting for your WhatsApp message..." });
        return;
    }

    if (session.status === "EXPIRED") {
        res.json({ status: "EXPIRED", message: "Verification code has expired." });
        return;
    }

    // VERIFIED
    if (session.status === "VERIFIED" && session.businessId) {
        const [business] = await db.select().from(businesses).where(eq(businesses.id, session.businessId)).limit(1);
        res.json({ status: "VERIFIED", token: session.token, business, message: "Phone verified successfully!" });
        return;
    }

    res.json({ status: session.status });
});

/**
 * GET + POST /api/whatsapp/webhook
 *
 * GET  - Meta webhook challenge (one-time URL verification).
 * POST - Incoming WhatsApp messages delivered by Meta servers.
 *
 * Flow on POST:
 *   1. Respond HTTP 200 IMMEDIATELY (Meta retries if no 200 in 20s).
 *   2. Parse message.from (real sender phone) + message.text.body.
 *   3. Match VERIFY_REF-XXXXXX nonce -> find PENDING session.
 *   4. Insert new business row, mark session VERIFIED.
 *   5. Frontend polling detects VERIFIED within <=2 seconds.
 */
export const handleWhatsAppWebhook = (req: Request, res: Response): void => {
    // Webhook URL verification challenge (GET)
    if (req.method === "GET") {
        const mode = req.query["hub.mode"];
        const token = req.query["hub.verify_token"];
        const challenge = req.query["hub.challenge"];
        const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "refpulse_webhook_secret";

        if (mode === "subscribe" && token === VERIFY_TOKEN) {
            console.log("[WA-Webhook] Challenge accepted");
            res.status(200).send(challenge as string);
        } else {
            console.warn("[WA-Webhook] Challenge FAILED - wrong verify_token");
            res.status(403).json({ error: "Forbidden" });
        }
        return;
    }

    // Incoming message (POST) - respond immediately
    res.status(200).send("EVENT_RECEIVED");
    processIncomingMessage(req.body).catch((err) => console.error("[WA-Webhook] Error:", err));
};

async function processIncomingMessage(body: any): Promise<void> {
    const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message || !message.text) return; // ignore status updates etc.

    const senderPhone: string = message.from;
    const text: string = (message.text.body ?? "").trim().toUpperCase();

    console.log(`[WA-Webhook] From: ${senderPhone} | "${text}"`);

    const match = text.match(/^VERIFY_(REF-\d{6})$/);
    if (!match) return;

    const nonce = match[1];

    const [session] = await db
        .select()
        .from(whatsappVerifications)
        .where(eq(whatsappVerifications.nonce, nonce))
        .limit(1);

    if (!session) { console.warn(`[WA-Webhook] Unknown nonce: ${nonce}`); return; }
    if (session.status !== "PENDING") { console.log(`[WA-Webhook] Already ${session.status}`); return; }
    if (new Date() > session.expiresAt) {
        await db.update(whatsappVerifications).set({ status: "EXPIRED" }).where(eq(whatsappVerifications.nonce, nonce));
        console.warn(`[WA-Webhook] Expired: ${nonce}`);
        return;
    }

    const businessId = `biz_${nanoid(10)}`;
    const token = generateToken(businessId);

    const [newBusiness] = await db
        .insert(businesses)
        .values({
            id: businessId,
            name: session.businessName,
            phone: senderPhone,                    // REAL phone from WhatsApp
            email: session.businessEmail ?? null,
            subsStatus: session.subsStatus,
            phoneVerified: true,
        })
        .returning();

    await db
        .update(whatsappVerifications)
        .set({ status: "VERIFIED", verifiedPhone: senderPhone, businessId, token })
        .where(eq(whatsappVerifications.nonce, nonce));

    console.log(`[WA-Webhook] Business created: ${newBusiness.id} | phone=${senderPhone}`);
}
