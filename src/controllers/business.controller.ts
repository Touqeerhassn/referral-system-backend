import QRCode from "qrcode";
import { getBotPhoneNumber, getWhatsAppStatus } from "../services/whatsapp.service";
﻿import { Request, Response } from "express";
import { nanoid } from "nanoid";
import { eq, desc, or, like } from "drizzle-orm";
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


/**
 * POST /api/businesses/login
 *
 * Fast Dev Login: looks up registered business by phone number or email.
 * Issues auth token and returns business info.
 */
/**
 * POST /api/businesses/login
 *
 * Fast Dev Login: looks up registered business by phone number or email.
 * Supports Pakistani local (03xx), international (+92 / 92), or email formats.
 * Issues auth token and returns business info.
 */
export const loginBusiness = asyncHandler(async (req: Request, res: Response) => {
    const rawInput = (req.body.phone || req.body.email || "").toString().trim();
    if (!rawInput) {
        res.status(400).json({
            success: false,
            error: "Please provide your phone number or email to log in.",
        });
        return;
    }

    const cleanDigits = rawInput.replace(/\D/g, "");
    const trimmedEmail = rawInput.toLowerCase();

    const searchVariants = new Set<string>();
    if (cleanDigits) {
        searchVariants.add(cleanDigits);
        searchVariants.add(`+${cleanDigits}`);

        if (cleanDigits.startsWith("0")) {
            const withoutZero = cleanDigits.replace(/^0+/, "");
            searchVariants.add(withoutZero);
            searchVariants.add(`92${withoutZero}`);
            searchVariants.add(`+92${withoutZero}`);
        } else if (cleanDigits.startsWith("92")) {
            const withoutCode = cleanDigits.slice(2);
            searchVariants.add(withoutCode);
            searchVariants.add(`0${withoutCode}`);
        }

        if (cleanDigits.length >= 9) {
            searchVariants.add(cleanDigits.slice(-9));
            searchVariants.add(cleanDigits.slice(-10));
        }
    }

    const conditions = Array.from(searchVariants).map((v) => eq(businesses.phone, v));

    if (trimmedEmail.includes("@")) {
        conditions.push(eq(businesses.email, trimmedEmail));
    }

    if (cleanDigits.length >= 9) {
        conditions.push(like(businesses.phone, `%${cleanDigits.slice(-9)}`));
    }

    const [business] = await db
        .select()
        .from(businesses)
        .where(or(...conditions))
        .orderBy(desc(businesses.createdAt))
        .limit(1);

    if (!business) {
        res.status(404).json({
            success: false,
            error: "No business found with this phone number or email. Please register first.",
        });
        return;
    }

    const token = generateToken(business.id);

    res.json({
        success: true,
        message: `Welcome back, ${business.name}!`,
        token,
        business,
    });
});

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
    const botNum = getBotPhoneNumber() || WA_NUMBER;
    const waLink = `https://wa.me/${botNum}?text=${encodeURIComponent(codeText)}`;

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
            phone: session.claimedPhone || senderPhone,
            email: session.businessEmail ?? null,
            subsStatus: session.subsStatus,
            phoneVerified: true,
        })
        .returning();

    await db
        .update(whatsappVerifications)
        .set({ status: "VERIFIED", verifiedPhone: senderPhone || session.claimedPhone, businessId, token })
        .where(eq(whatsappVerifications.nonce, nonce));

    console.log(`[WA-Webhook] Business created: ${newBusiness.id} | phone=${senderPhone}`);
}

export const getWhatsAppBotStatus = asyncHandler(async (_req: Request, res: Response) => {
    res.json({ success: true, ...getWhatsAppStatus() });
});


export const renderWhatsAppQrPage = asyncHandler(async (_req: Request, res: Response) => {
    const statusInfo = getWhatsAppStatus();

    let qrImageHtml = "";
    if (statusInfo.latestQr) {
        const qrDataUrl = await QRCode.toDataURL(statusInfo.latestQr, {
            width: 400,
            margin: 2,
            color: {
                dark: "#0f172a",
                light: "#ffffff",
            },
        });
        qrImageHtml = `
            <div style="background: white; padding: 16px; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.08); display: inline-block;">
                <img src="${qrDataUrl}" alt="WhatsApp QR Code" style="width: 320px; height: 320px; display: block;" />
            </div>
            <div style="margin-top: 18px; text-align: left; background: #f8fafc; border: 1px solid #e2e8f0; padding: 14px 18px; border-radius: 14px;">
                <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 700; color: #0f172a;">How to scan:</p>
                <ol style="margin: 0; padding-left: 20px; font-size: 13px; color: #334155; line-height: 1.6;">
                    <li>Open <b>WhatsApp</b> on your mobile phone.</li>
                    <li>Tap <b>Settings &rarr; Linked Devices &rarr; Link a Device</b>.</li>
                    <li>Point your phone camera at the QR code above.</li>
                </ol>
            </div>
            <p style="font-size: 12px; color: #94a3b8; margin-top: 12px;">
                🔄 Auto-refreshing every 6s to ensure QR freshness...
            </p>
        `;
    } else if (statusInfo.isReady) {
        qrImageHtml = `
            <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 28px; border-radius: 20px; display: inline-block; max-width: 420px;">
                <div style="font-size: 46px; margin-bottom: 10px;">✅</div>
                <h3 style="color: #065f46; margin: 0 0 8px 0; font-size: 22px; font-weight: 800;">WhatsApp is Connected!</h3>
                <p style="color: #047857; margin: 0; font-size: 15px;">
                    Bot is actively connected as: <b>+${statusInfo.botNumber}</b>
                </p>
            </div>
            <p style="font-size: 12px; color: #94a3b8; margin-top: 14px;">
                You can close this window now. The bot is ready to verify registrations.
            </p>
        `;
    } else {
        qrImageHtml = `
            <div style="background: #fffbeb; border: 1px solid #fde68a; padding: 28px; border-radius: 20px; display: inline-block; max-width: 420px;">
                <div style="font-size: 46px; margin-bottom: 10px;">⏳</div>
                <h3 style="color: #92400e; margin: 0 0 8px 0; font-size: 20px; font-weight: 800;">Starting WhatsApp Session...</h3>
                <p style="color: #b45309; margin: 0; font-size: 14px;">
                    Status: <b>${statusInfo.status}</b>. Launching browser to generate QR code...
                </p>
            </div>
            <p style="font-size: 12px; color: #94a3b8; margin-top: 14px;">
                🔄 Auto-checking every 4s...
            </p>
        `;
    }

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="refresh" content="${statusInfo.isReady ? 25 : 5}">
        <title>Connect WhatsApp Web | RefPulse</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background: linear-gradient(135deg, #f0fdf4 0%, #f8fafc 100%);
                min-height: 100vh;
                margin: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                box-sizing: border-box;
                text-align: center;
            }
            .card {
                background: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(10px);
                border: 1px solid #e2e8f0;
                border-radius: 24px;
                padding: 36px 28px;
                max-width: 480px;
                width: 100%;
                box-shadow: 0 20px 40px -15px rgba(0,0,0,0.07);
            }
            .badge {
                display: inline-block;
                padding: 5px 14px;
                border-radius: 9999px;
                font-size: 12px;
                font-weight: 700;
                margin-bottom: 14px;
            }
        </style>
    </head>
    <body>
        <div class="card">
            <div class="badge" style="background: #dcfce7; color: #166534;">
                WhatsApp Business Link
            </div>
            <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 22px; font-weight: 800;">
                Link WhatsApp Device
            </h2>
            ${qrImageHtml}
        </div>
    </body>
    </html>
    `;

    res.setHeader("Content-Type", "text/html");
    res.send(html);
});
