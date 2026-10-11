import { Router } from "express";
import { ProviderController } from "../controllers/provider.controller.js";
import { ClinicalRecordController } from "../controllers/clinical-record.controller.js";
import { EncounterController } from "../controllers/encounter.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.get("/sessions", ProviderController.listSessions);
router.get("/sessions/:sessionId", ProviderController.getSessionContext);
router.get("/sessions/:sessionId/records", ProviderController.getSharedRecords);
router.get("/sessions/:sessionId/records/:recordId", ProviderController.getSharedRecordDetail);
router.get("/sessions/:sessionId/documents/:documentId", ProviderController.getSharedDocument);


// Encounter Clinical Records & Status Management
router.get("/encounters", EncounterController.getProviderEncounters);
router.patch("/encounters/:encounterId", EncounterController.updateProviderEncounter);
router.post("/encounters/:encounterId/consultations", ClinicalRecordController.createConsultation);
router.post("/encounters/:encounterId/prescriptions", ClinicalRecordController.createPrescription);
router.post("/encounters/:encounterId/lab-orders", ClinicalRecordController.createLabOrder);
router.get("/encounters/:encounterId/records", ClinicalRecordController.getProviderEncounterRecords);

export default router;
