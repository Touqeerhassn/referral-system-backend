import { Router } from "express";
import { handleWhatsAppWebhook } from "../controllers/business.controller";

const router = Router();

/**
 * GET  /api/whatsapp/webhook  - Meta webhook challenge verification (one-time setup)
 * POST /api/whatsapp/webhook  - Incoming WhatsApp messages from Meta Cloud API
 *
 * Register this URL in Meta Developer Console:
 *   Callback URL: https://<your-railway-domain>/api/whatsapp/webhook
 *   Verify Token: (value of WHATSAPP_WEBHOOK_VERIFY_TOKEN in .env)
 */
router.get("/webhook", handleWhatsAppWebhook);
router.post("/webhook", handleWhatsAppWebhook);

export default router;
