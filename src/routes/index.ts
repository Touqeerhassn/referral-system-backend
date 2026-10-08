import { Router } from "express";
import businessRouter from "./business.routes";
import campaignRouter from "./campaign.routes";
import participantRouter from "./participant.routes";
import whatsappRouter from "./whatsapp.routes";

const router = Router();

router.use("/businesses", businessRouter);
router.use("/campaigns", campaignRouter);
router.use("/participants", participantRouter);
router.use("/whatsapp", whatsappRouter);

export default router;
