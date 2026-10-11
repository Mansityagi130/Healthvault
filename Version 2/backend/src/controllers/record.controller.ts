import type { Response } from "express";
import { RecordService } from "../services/record.service.js";
import {
  createRecordSchema,
  updateRecordSchema,
  listRecordsSchema
} from "../schemas/record.schema.js";
import type { AuthRequest } from "../middleware/auth.middleware.js";
import { PdfExportService, type MedicalHistoryExportOptions } from "../services/pdf-export.service.js";

export const RecordController = {
  async list(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const query = listRecordsSchema.parse(req.query);

      const result = await RecordService.listRecords(
        userId,
        query
      );

      res.status(200).json(result);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "ZodError") {
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Needed for test fixtures/types
        res.status(400).json({ error: "Validation error", details: (error as any).errors });
      } else {
        res.status(500).json({ error: "Failed to fetch records" });
      }
    }
  },

  async get(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const recordId = req.params.recordId as string;

      // UUID basic check (Zod or just regex could be used here)
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recordId)) {
        res.status(400).json({ error: "Invalid record ID" });
        return;
      }

      const record = await RecordService.getRecord(userId, recordId);
      res.status(200).json(record);
    } catch (error: unknown) {
      if (error instanceof Error && (error.message === "Record not found" || error.message === "Patient profile not found")) {
        res.status(404).json({ error: "Record not found" });
      } else {
        res.status(500).json({ error: "Failed to fetch record" });
      }
    }
  },

  async create(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const data = createRecordSchema.parse(req.body);

      const record = await RecordService.createRecord(userId, data);
      res.status(201).json(record);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "ZodError") {
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Needed for test fixtures/types
        res.status(400).json({ error: "Validation error", details: (error as any).errors });
      } else {
        res.status(500).json({ error: "Failed to create record" });
      }
    }
  },

  async update(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const recordId = req.params.recordId as string;

      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recordId)) {
        res.status(400).json({ error: "Invalid record ID" });
        return;
      }

      const data = updateRecordSchema.parse(req.body);

      const record = await RecordService.updateRecord(userId, recordId, data);
      res.status(200).json(record);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "ZodError") {
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Needed for test fixtures/types
        res.status(400).json({ error: "Validation error", details: (error as any).errors });
      } else if (error instanceof Error && error.message === "Record not found") {
        res.status(404).json({ error: "Record not found" });
      } else if (error instanceof Error && error.message === "Cannot modify verified clinical records") {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Failed to update record" });
      }
    }
  },

  async timeline(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const query = {
        category: req.query.category as string,
        search: req.query.search as string,
        dateFrom: req.query.dateFrom as string,
        dateTo: req.query.dateTo as string,
      };

      const timeline = await RecordService.getTimeline(userId, query);
      res.status(200).json(timeline);
    } catch (error: unknown) {
      console.error("TIMELINE ERROR:", error);
      res.status(500).json({ error: "Failed to fetch patient timeline" });
    }
  },

  async exportPdf(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const options: MedicalHistoryExportOptions = {};
      const recordIds = req.body?.recordIds || (req.query.recordIds ? (Array.isArray(req.query.recordIds) ? (req.query.recordIds as string[]) : [req.query.recordIds as string]) : undefined);
      if (recordIds) options.recordIds = recordIds;
      const category = (req.body?.category || req.query.category) as string | undefined;
      if (category) options.category = category;
      const dateFrom = (req.body?.dateFrom || req.query.dateFrom) as string | undefined;
      if (dateFrom) options.dateFrom = dateFrom;
      const dateTo = (req.body?.dateTo || req.query.dateTo) as string | undefined;
      if (dateTo) options.dateTo = dateTo;

      const { buffer, filename } = await PdfExportService.generateMedicalHistoryPdf(userId, options);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", buffer.length);
      res.status(200).send(buffer);
    } catch (error: unknown) {
      console.error("PDF Export error:", error);
      res.status(500).json({ error: "Failed to generate medical history PDF" });
    }
  }
};
