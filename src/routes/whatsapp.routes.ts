import { Router } from "express";
import { handleWhatsAppWebhook, getWhatsAppBotStatus } from "../controllers/business.controller";

const router = Router();

/**
 * GET  /api/whatsapp/status   - Current status of the WhatsApp bot & QR code
 * GET  /api/whatsapp/webhook  - Meta webhook challenge verification (one-time setup)
 * POST /api/whatsapp/webhook  - Incoming WhatsApp messages from Meta Cloud API
 */
router.get("/status", getWhatsAppBotStatus);
router.get("/webhook", handleWhatsAppWebhook);
router.post("/webhook", handleWhatsAppWebhook);

export default router;
