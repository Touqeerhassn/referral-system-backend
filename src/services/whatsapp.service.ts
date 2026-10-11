// @ts-ignore
import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import fs from "fs";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db";
import { businesses, whatsappVerifications } from "../db/schema";

export type WhatsAppBotStatus = "INITIALIZING" | "AWAITING_QR" | "READY" | "DISCONNECTED" | "ERROR";

let clientInstance: any = null;
let currentStatus: WhatsAppBotStatus = "INITIALIZING";
let latestQr: string | null = null;
let botNumber: string | null = null;

function resolveBrowserPath(): string | undefined {
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        return process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    if (process.platform === "linux") {
        try {
            const { execSync } = require("child_process");
            const detected = execSync(
                "which chromium || which chromium-browser || which google-chrome-stable || which google-chrome",
                { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
            ).trim();
            if (detected) {
                console.log(`[WhatsApp-Web] Found system Chromium via which: ${detected}`);
                return detected;
            }
        } catch (_) {}

        const linuxCandidates = [
            "/root/.nix-profile/bin/chromium",
            "/nix/var/nix/profiles/default/bin/chromium",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/google-chrome",
        ];
        for (const candidate of linuxCandidates) {
            if (fs.existsSync(candidate)) {
                console.log(`[WhatsApp-Web] Found system Chromium at fallback path: ${candidate}`);
                return candidate;
            }
        }
        console.log("[WhatsApp-Web] Falling back to system 'chromium' executable on PATH");
        return "chromium";
    }
    const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
    if (process.platform === "win32" && fs.existsSync(edgePath)) {
        return edgePath;
    }
    const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    if (process.platform === "win32" && fs.existsSync(chromePath)) {
        return chromePath;
    }
    return undefined;
}

function generateToken(businessId: string): string {
    const payload = Buffer.from(JSON.stringify({ sub: businessId, iat: Date.now() })).toString("base64");
    return `beta_${payload}`;
}

export function getWhatsAppStatus() {
    return {
        status: currentStatus,
        isReady: currentStatus === "READY",
        botNumber: getBotPhoneNumber(),
        qrAvailable: Boolean(latestQr),
        latestQr,
    };
}

export function getBotPhoneNumber(): string {
    if (botNumber) return botNumber;
    const envNum = process.env.WHATSAPP_BOT_NUMBER || process.env.WHATSAPP_BUSINESS_NUMBER;
    return (envNum || "0000000000").replace(/\D/g, "");
}

export function initWhatsApp(): any {
    if (clientInstance) return clientInstance;

    const executablePath = resolveBrowserPath();
    console.log(`[WhatsApp-Web] Initializing client (executablePath: ${executablePath || "default chromium"})...`);

    const client = new Client({
        authStrategy: new LocalAuth({
            dataPath: "./.wwebjs_auth",
        }),
        puppeteer: {
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--no-first-run",
                "--no-zygote",
                "--disable-gpu",
            ],
            ...(executablePath ? { executablePath } : {}),
        },
    });

    client.on("qr", (qr: string) => {
        currentStatus = "AWAITING_QR";
        latestQr = qr;
        console.log("\n==================================================");
        console.log("[WhatsApp-Web] SCAN THIS QR CODE IN WHATSAPP:");
        console.log("Settings > Linked Devices > Link a Device");
        console.log("==================================================\n");
        qrcode.generate(qr, { small: true });
        console.log("\n==================================================\n");
    });

    client.on("authenticated", () => {
        console.log("[WhatsApp-Web] Authenticated successfully with session data!");
        latestQr = null;
    });

    client.on("auth_failure", (err: any) => {
        currentStatus = "ERROR";
        console.error("[WhatsApp-Web] Authentication failure:", err);
    });

    client.on("ready", () => {
        currentStatus = "READY";
        latestQr = null;
        const widUser = client.info?.wid?.user;
        if (widUser) {
            botNumber = widUser.replace(/\D/g, "");
        }
        console.log(`[WhatsApp-Web] Client is READY! Connected as: +${getBotPhoneNumber()}`);
    });

    client.on("disconnected", (reason: any) => {
        currentStatus = "DISCONNECTED";
        console.warn("[WhatsApp-Web] Disconnected:", reason);
    });

    client.on("message", async (msg: any) => {
        try {
            await handleIncomingWhatsAppMessage(msg);
        } catch (err) {
            console.error("[WhatsApp-Web] Error in message handler:", err);
        }
    });

    clientInstance = client;

    const cleanup = async () => {
        if (clientInstance) {
            try {
                await clientInstance.destroy();
            } catch (_) {}
        }
    };
    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);

    client.initialize().catch((err: any) => {
        currentStatus = "ERROR";
        console.error("[WhatsApp-Web] Failed to initialize client:", err);
    });

    return client;
}

async function handleIncomingWhatsAppMessage(msg: any): Promise<void> {
    const rawText = (msg.body || "").trim();
    const text = rawText.toUpperCase();
    const senderRaw = msg.from || "";

    // If sent from standard WhatsApp user: "923001234567@c.us" -> "923001234567"
    // If sent from linked multi-device: "49795985076356@lid" -> WhatsApp LID (not a phone number)
    let resolvedPhone: string | null = null;
    if (senderRaw.endsWith("@c.us")) {
        resolvedPhone = senderRaw.replace(/@c\.us$/, "").replace(/\D/g, "");
    } else if (senderRaw.endsWith("@lid")) {
        try {
            const contact = await msg.getContact();
            if (contact?.number && !contact.id?._serialized?.endsWith("@lid")) {
                resolvedPhone = contact.number.replace(/\D/g, "");
            }
        } catch (err) {
            console.warn("[WhatsApp-Web] getContact error:", err);
        }
        if (!resolvedPhone && clientInstance) {
            try {
                const [info] = await clientInstance.getContactLidAndPhone([senderRaw]);
                if (info?.pn) {
                    resolvedPhone = info.pn.replace(/@c\.us$/, "").replace(/\D/g, "");
                }
            } catch (err) {
                console.warn("[WhatsApp-Web] getContactLidAndPhone error:", err);
            }
        }
    }

    console.log(`[WhatsApp-Web] Incoming from: ${senderRaw} (resolvedPhone: ${resolvedPhone || "none"}) | Message: "${rawText}"`);

    const match = text.match(/VERIFY_(REF-\d{6})/);
    if (!match) return;

    const nonce = match[1];

    const [session] = await db
        .select()
        .from(whatsappVerifications)
        .where(eq(whatsappVerifications.nonce, nonce))
        .limit(1);

    if (!session) {
        console.warn(`[WhatsApp-Web] Unknown nonce: ${nonce}`);
        await msg.reply("❌ Verification code not recognized or expired. Please start registration again in your browser.");
        return;
    }

    if (session.status === "VERIFIED") {
        console.log(`[WhatsApp-Web] Nonce ${nonce} already verified`);
        await msg.reply("ℹ️ This verification code has already been verified.");
        return;
    }

    if (new Date() > session.expiresAt || session.status === "EXPIRED") {
        await db.update(whatsappVerifications).set({ status: "EXPIRED" }).where(eq(whatsappVerifications.nonce, nonce));
        console.warn(`[WhatsApp-Web] Nonce ${nonce} expired`);
        await msg.reply("❌ This verification code has expired. Please initiate a new verification code from the website.");
        return;
    }

    // Success: Create business record and verify session
    const businessId = `biz_${nanoid(10)}`;
    const token = generateToken(businessId);

    // Business phone: ALWAYS use the number the user registered with (claimedPhone)
    // Avoid saving internal WhatsApp LIDs like 49795985076356 as the login phone number
    const businessPhone = session.claimedPhone || resolvedPhone || senderRaw.replace(/\D/g, "");
    const verifiedPhoneToSave = resolvedPhone || session.claimedPhone;

    const [newBusiness] = await db
        .insert(businesses)
        .values({
            id: businessId,
            name: session.businessName,
            phone: businessPhone,
            email: session.businessEmail ?? null,
            subsStatus: session.subsStatus,
            phoneVerified: true,
        })
        .returning();

    await db
        .update(whatsappVerifications)
        .set({
            status: "VERIFIED",
            verifiedPhone: verifiedPhoneToSave,
            businessId,
            token,
        })
        .where(eq(whatsappVerifications.nonce, nonce));

    console.log(`[WhatsApp-Web] SUCCESS: Verified ${nonce} for business ${newBusiness.id} (Business Phone: ${businessPhone})`);

    // Reply back on WhatsApp to confirm!
    await msg.reply(
        `✅ *Verification Successful!*\n\n` +
        `Your RefPulse business account (*${session.businessName}*) has been verified with phone ${businessPhone}.\n\n` +
        `You can return to your browser to access your dashboard!`
    );
}
