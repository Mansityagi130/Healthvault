import { z } from "zod";

export const updateEmergencyProfileSchema = z.object({
  bloodGroup: z.string().max(10).optional().nullable(),
  allergies: z.array(z.string()).optional().nullable(),
  emergencyMedications: z.array(z.string()).optional().nullable(),
  criticalConditions: z.array(z.string()).optional().nullable(),
  emergencyContact: z.object({
    name: z.string(),
    relationship: z.string(),
    phone: z.string(),
  }).optional().nullable(),
  isActive: z.boolean().optional(),
}).strict();

export const generateEmergencyQrSchema = z.object({
  durationHours: z.number().int().min(1).max(168).default(24), // Max 7 days
  maxUses: z.number().int().min(1).max(100).optional().nullable(),
}).strict();

export const resolveEmergencyAccessSchema = z.object({
  selector: z.string().uuid(),
  token: z.string().min(32),
  reason: z.string().min(5, "Reason for emergency access must be at least 5 characters long"),
}).strict();
