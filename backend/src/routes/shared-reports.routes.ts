import { Router } from "express";
import { ReportShareController } from "../controllers/report-share.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { sharedReportLimiter } from "../middleware/rate-limiter.middleware.js";

export const sharedReportsRouter = Router();

// Recipient routes: Authentication is strictly enforced.
// If not authenticated, returns 401 Unauthorized, prompting frontend to redirect to login.
sharedReportsRouter.use(sharedReportLimiter);
sharedReportsRouter.use(authenticate);

sharedReportsRouter.get("/:token", ReportShareController.getSharedReports);
sharedReportsRouter.get("/:token/documents/:documentId", ReportShareController.downloadSharedDocument);

export default sharedReportsRouter;
