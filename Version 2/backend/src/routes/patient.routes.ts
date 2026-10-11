import { Router } from "express";
import multer from "multer";
import { PatientController } from "../controllers/patient.controller.js";
import { RecordController } from "../controllers/record.controller.js";
import { DocumentController } from "../controllers/document.controller.js";
import { SharingController } from "../controllers/sharing.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { LabAssociationController } from "../controllers/lab-association.controller.js";
import { HospitalRegistrationController } from "../controllers/hospital-registration.controller.js";
import { EncounterController } from "../controllers/encounter.controller.js";
import { ReportShareController } from "../controllers/report-share.controller.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  }
});

const router = Router();

router.use(authenticate);

router.get("/profile", PatientController.getProfile);
router.patch("/profile", PatientController.updateProfile);

router.get("/encounters", EncounterController.getPatientEncounters);

router.get("/timeline", RecordController.timeline);

router.get("/records", RecordController.list);
router.get("/records/export/pdf", RecordController.exportPdf);
router.post("/records/export/pdf", RecordController.exportPdf);
router.get("/export/pdf", RecordController.exportPdf);
router.post("/export/pdf", RecordController.exportPdf);
router.get("/records/:recordId", RecordController.get);
router.post("/records", RecordController.create);
router.patch("/records/:recordId", RecordController.update);

router.post("/records/:recordId/documents", upload.single("file"), DocumentController.upload);
router.get("/documents", DocumentController.list);
router.get("/documents/:documentId", DocumentController.download);

router.get("/providers/fixtures", SharingController.getProviders);
router.post("/sharing", SharingController.createDirectShare);
router.get("/sharing", SharingController.listShares);
router.post("/sharing/:sessionId/revoke", SharingController.revokeShare);

// QR Report Sharing (24-Hour Expiry, Patient-to-Patient)
router.post("/report-shares", ReportShareController.createShare);
router.get("/report-shares", ReportShareController.listPatientShares);
router.delete("/report-shares/:shareId/revoke", ReportShareController.revokeShare);
router.post("/report-shares/:shareId/revoke", ReportShareController.revokeShare);

router.post("/lab-associations/pairing-token", LabAssociationController.generatePairingToken);
router.get("/lab-associations", LabAssociationController.listPatientAssociations);
router.post("/lab-associations/approve", LabAssociationController.approveAssociation);
router.post("/lab-associations/revoke", LabAssociationController.revokeAssociation);

router.post("/registration-token", HospitalRegistrationController.generateRegistrationToken);

export default router;
