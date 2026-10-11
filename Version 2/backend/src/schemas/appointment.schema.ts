import { z } from "zod";
import { AppointmentStatus } from "../generated/prisma/enums.js";

export const bookAppointmentSchema = z.object({
  hospitalId: z.string().uuid(),
  doctorId: z.string().uuid(),
  departmentId: z.string().uuid().optional().nullable(),
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format, expected YYYY-MM-DD"),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Invalid start time format, expected HH:MM"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Invalid end time format, expected HH:MM"),
  reason: z.string().max(500).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
}).strict();

export const listAppointmentsSchema = z.object({
  status: z.nativeEnum(AppointmentStatus).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
}).strict();

export const cancelAppointmentSchema = z.object({
  reason: z.string().max(500).optional().nullable(),
}).strict();

export const rescheduleAppointmentSchema = z.object({
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format, expected YYYY-MM-DD"),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Invalid start time format, expected HH:MM"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Invalid end time format, expected HH:MM"),
}).strict();

export const providerAvailabilitySchema = z.object({
  doctorId: z.string().uuid(),
  hospitalId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format, expected YYYY-MM-DD"),
}).strict();
