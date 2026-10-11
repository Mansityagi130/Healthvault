import type { Response } from "express";
import type { AuthRequest } from "../middleware/auth.middleware.js";
import { EmergencyService } from "../services/emergency.service.js";
import { PdfExportService } from "../services/pdf-export.service.js";
import { 
  updateEmergencyProfileSchema, 
  generateEmergencyQrSchema, 
  resolveEmergencyAccessSchema 
} from "../schemas/emergency.schema.js";

export class EmergencyController {
  static async getProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const profile = await EmergencyService.getProfile(userId);
      res.json(profile);
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  static async updateProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const data = updateEmergencyProfileSchema.parse(req.body);
      const updated = await EmergencyService.updateProfile(userId, data);
      res.json(updated);
    } catch (err: unknown) {
      if ((err as { name?: string }).name === "ZodError") {
        res.status(400).json({ error: "Validation error", details: (err as { errors?: unknown }).errors });
      } else {
        res.status(400).json({ error: (err as Error).message });
      }
    }
  }

  static async generateQr(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const data = generateEmergencyQrSchema.parse(req.body || {});
      const qrData = await EmergencyService.generateEmergencyQr(userId, data.durationHours, data.maxUses ?? undefined);
      res.status(201).json(qrData);
    } catch (err: unknown) {
      if ((err as { name?: string }).name === "ZodError") {
        res.status(400).json({ error: "Validation error", details: (err as { errors?: unknown }).errors });
      } else {
        res.status(400).json({ error: (err as Error).message });
      }
    }
  }

  static async listQrs(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const qrs = await EmergencyService.listEmergencyQrs(userId);
      res.json(qrs);
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  static async revokeQr(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const selector = req.params.selector as string;
      const result = await EmergencyService.revokeEmergencyQr(userId, selector);
      res.json(result);
    } catch (err: unknown) {
      res.status(400).json({ error: (err as Error).message });
    }
  }

  static async resolveAccess(req: AuthRequest, res: Response): Promise<void> {
    try {
      const providerUserId = req.user!.id;
      const data = resolveEmergencyAccessSchema.parse(req.body);
      const emergencyData = await EmergencyService.resolveEmergencyAccess(
        providerUserId,
        data.selector,
        data.token,
        data.reason
      );
      res.json(emergencyData);
    } catch (err: unknown) {
      if ((err as { name?: string }).name === "ZodError") {
        res.status(400).json({ error: "Validation error", details: (err as { errors?: unknown }).errors });
      } else {
        res.status(400).json({ error: (err as Error).message });
      }
    }
  }

  static async getHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const history = await EmergencyService.getAccessHistory(userId);
      res.json(history);
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  static async exportPdf(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { buffer, filename } = await PdfExportService.generateEmergencySummaryPdf(userId);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", buffer.length);
      res.status(200).send(buffer);
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
}
