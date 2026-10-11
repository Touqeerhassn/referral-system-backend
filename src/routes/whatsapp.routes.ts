import { Router } from "express";
import {
    handleWhatsAppWebhook,
    getWhatsAppBotStatus,
    renderWhatsAppQrPage,
} from "../controllers/business.controller";

const router = Router();

/**
 * GET  /api/whatsapp/qr       - Web page displaying sharp QR code for easy scanning
 * GET  /api/whatsapp/status   - Current status of the WhatsApp bot & QR code
 * GET  /api/whatsapp/webhook  - Meta webhook challenge verification (one-time setup)
 * POST /api/whatsapp/webhook  - Incoming WhatsApp messages from Meta Cloud API
 */
router.get("/qr", renderWhatsAppQrPage);
router.get("/status", getWhatsAppBotStatus);
router.get("/webhook", handleWhatsAppWebhook);
router.post("/webhook", handleWhatsAppWebhook);

export default router;
