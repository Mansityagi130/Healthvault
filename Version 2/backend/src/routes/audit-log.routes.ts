import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { getAuditLogs } from "../controllers/audit-log.controller.js";

export const auditLogRouter = Router();

auditLogRouter.get("/", authenticate, getAuditLogs);
