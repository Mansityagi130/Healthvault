import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { requirePlatformAdmin } from "../middleware/rbac.middleware.js";
import { PlatformAdminController } from "../controllers/platform-admin.controller.js";

const router = Router();

// Protect all platform admin endpoints
router.use(authenticate);
router.use(requirePlatformAdmin);

router.get("/hospitals", PlatformAdminController.getHospitals);
router.get("/hospitals/:hospitalId", PlatformAdminController.getHospitalDetails);
router.post("/hospitals/:hospitalId/verify", PlatformAdminController.verifyHospital);
router.post("/hospitals/:hospitalId/reject", PlatformAdminController.rejectHospital);
router.post("/hospitals/:hospitalId/suspend", PlatformAdminController.suspendHospital);
router.post("/hospitals/:hospitalId/restore", PlatformAdminController.restoreHospital);

router.get("/labs", PlatformAdminController.getLabs);
router.post("/labs/:labId/verify", PlatformAdminController.verifyLab);
router.post("/labs/:labId/reject", PlatformAdminController.rejectLab);
router.post("/labs/:labId/suspend", PlatformAdminController.suspendLab);

router.get("/audit-logs", PlatformAdminController.getAuditLogs);

export default router;
