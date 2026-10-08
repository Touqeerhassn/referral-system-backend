import { Router } from "express";
import {
    registerBusiness,
    getBusinessCampaigns,
    getBusinessParticipants,
    initiateWhatsAppVerify,
    checkVerifyStatus,
    handleWhatsAppWebhook,
} from "../controllers/business.controller";
import { validate } from "../middleware/validate";
import {
    registerBusinessSchema,
    businessParamsSchema,
    initiateVerifySchema,
    verifyStatusQuerySchema,
} from "../validators/business.validator";

const router = Router();

// ── Existing routes ───────────────────────────────────────────────────────────

// POST /api/businesses/register  (legacy direct-register)
router.post("/register", validate(registerBusinessSchema), registerBusiness);

// GET  /api/businesses/:businessId/campaigns
router.get("/:businessId/campaigns", validate(businessParamsSchema, "params"), getBusinessCampaigns);

// GET  /api/businesses/:businessId/participants
router.get("/:businessId/participants", validate(businessParamsSchema, "params"), getBusinessParticipants);

// ── WhatsApp Reverse Verification routes ──────────────────────────────────────

// POST /api/businesses/verify/initiate
// Step 1: create pending session, return wa.me deep-link + nonce
router.post("/verify/initiate", validate(initiateVerifySchema), initiateWhatsAppVerify);

// GET  /api/businesses/verify/status?nonce=REF-849201
// Step 2 (polling): returns PENDING | VERIFIED | EXPIRED
router.get("/verify/status", validate(verifyStatusQuerySchema, "query"), checkVerifyStatus);

export default router;
