import { Router } from "express";
import { EmergencyController } from "../controllers/emergency.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

export const emergencyRouter = Router();

emergencyRouter.use(authenticate);

// Patient Emergency Profile & QR Management
emergencyRouter.get("/profile", EmergencyController.getProfile);
emergencyRouter.get("/export/pdf", EmergencyController.exportPdf);
emergencyRouter.put("/profile", EmergencyController.updateProfile);
emergencyRouter.post("/qr", EmergencyController.generateQr);
emergencyRouter.get("/qr", EmergencyController.listQrs);
emergencyRouter.delete("/qr/:selector", EmergencyController.revokeQr);
emergencyRouter.get("/history", EmergencyController.getHistory);

// Provider Break-Glass Emergency Access Resolution
emergencyRouter.post("/access/resolve", EmergencyController.resolveAccess);

export default emergencyRouter;
