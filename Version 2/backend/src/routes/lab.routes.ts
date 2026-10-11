import { Router } from "express";
import { LabController } from "../controllers/lab.controller.js";
import { LabAssociationController } from "../controllers/lab-association.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";


import { LabOnboardingController } from "../controllers/lab-onboarding.controller.js";

const router = Router();

// Public / Unauthenticated Lab Self-Registration Endpoint
router.post("/register", LabOnboardingController.registerLab);

// Protect all remaining lab routes
router.use(authenticate);

router.get("/", LabController.getLabs);
router.post("/:labId/invitations", LabOnboardingController.inviteStaff);
router.get("/:labId/stats", LabController.getStats);

router.post("/:labId/associations/consume", LabAssociationController.consumePairingToken);
router.get("/:labId/associations", LabAssociationController.listLabAssociations);

router.get("/:labId/reports", LabController.listReports);
router.post("/:labId/reports", LabController.createReport);
router.post("/:labId/reports/:reportId/results", LabController.addResult);
router.patch("/:labId/reports/:reportId/finalize", LabController.finalizeReport);
router.get("/:labId/reports/:reportId", LabController.getReport);

export default router;
