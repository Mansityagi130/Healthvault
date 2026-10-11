import type { Response } from "express";
import type { AuthRequest } from "../middleware/auth.middleware.js";
import { ReportShareService } from "../services/report-share.service.js";
import { z } from "zod";

const CreateReportShareSchema = z.object({
  recordIds: z.array(z.string().uuid()).optional().default([]),
  title: z.string().max(100).optional(),
});

export const ReportShareController = {
  async createShare(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const parsed = CreateReportShareSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
        return;
      }

      const result = await ReportShareService.createShare(
        userId,
        parsed.data.recordIds,
        parsed.data.title
      );

      res.status(201).json(result);
    } catch (error: any) {
      const status = error.statusCode || 500;
      res.status(status).json({ error: error.message || "Failed to create report share" });
    }
  },

  async getSharedReports(req: AuthRequest, res: Response) {
    try {
      const recipientUserId = req.user!.id;
      const token = req.params.token as string;

      if (!token) {
        res.status(400).json({ error: "Token is required" });
        return;
      }

      const result = await ReportShareService.getSharedReports(recipientUserId, token);
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.status(200).json(result);
    } catch (error: any) {
      const status = error.statusCode || 500;
      res.status(status).json({ error: error.message || "Failed to retrieve shared reports" });
    }
  },

  async downloadSharedDocument(req: AuthRequest, res: Response) {
    try {
      const recipientUserId = req.user!.id;
      const token = req.params.token as string;
      const documentId = req.params.documentId as string;

      if (!token || !documentId) {
        res.status(400).json({ error: "Token and document ID are required" });
        return;
      }

      const { metadata, buffer } = await ReportShareService.downloadSharedDocument(
        recipientUserId,
        token,
        documentId
      );

      res.setHeader("Content-Type", metadata.mimeType);
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${encodeURIComponent(metadata.originalFilename)}"`
      );
      res.setHeader("Content-Length", buffer.length);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.send(buffer);
    } catch (error: any) {
      const status = error.statusCode || 500;
      res.status(status).json({ error: error.message || "Failed to download shared document" });
    }
  },

  async listPatientShares(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const shares = await ReportShareService.listPatientShares(userId);
      res.status(200).json({ shares });
    } catch (error: any) {
      const status = error.statusCode || 500;
      res.status(status).json({ error: error.message || "Failed to list report shares" });
    }
  },

  async revokeShare(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const shareId = req.params.shareId as string;

      if (!shareId) {
        res.status(400).json({ error: "Share ID is required" });
        return;
      }

      const updated = await ReportShareService.revokeShare(userId, shareId);
      res.status(200).json({ message: "Share revoked successfully", share: updated });
    } catch (error: any) {
      const status = error.statusCode || 500;
      res.status(status).json({ error: error.message || "Failed to revoke report share" });
    }
  },
};
