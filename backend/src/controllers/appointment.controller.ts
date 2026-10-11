import type { Response } from "express";
import type { AuthRequest } from "../middleware/auth.middleware.js";
import { AppointmentService } from "../services/appointment.service.js";
import { 
  bookAppointmentSchema, 
  listAppointmentsSchema, 
  cancelAppointmentSchema, 
  rescheduleAppointmentSchema,
  providerAvailabilitySchema
} from "../schemas/appointment.schema.js";

export class AppointmentController {
  /**
   * Discover providers
   */
  static async discoverProviders(req: AuthRequest, res: Response): Promise<void> {
    try {
      const search = req.query.search as string | undefined;
      const specialty = req.query.specialty as string | undefined;
      const hospitalId = req.query.hospitalId as string | undefined;

      const filters: { search?: string; specialty?: string; hospitalId?: string } = {};
      if (search) filters.search = search;
      if (specialty) filters.specialty = specialty;
      if (hospitalId) filters.hospitalId = hospitalId;

      const providers = await AppointmentService.discoverProviders(filters);
      res.json(providers);
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  /**
   * Provider availability
   */
  static async getAvailability(req: AuthRequest, res: Response): Promise<void> {
    try {
      const data = providerAvailabilitySchema.parse(req.query);
      const availability = await AppointmentService.getProviderAvailability(data.doctorId, data.hospitalId, data.date);
      res.json(availability);
    } catch (err: unknown) {
      if ((err as { name?: string }).name === "ZodError") {
        res.status(400).json({ error: "Validation error", details: (err as { errors?: unknown }).errors });
      } else {
        res.status(400).json({ error: (err as Error).message });
      }
    }
  }

  /**
   * Book appointment
   */
  static async bookAppointment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const data = bookAppointmentSchema.parse(req.body);
      const appointment = await AppointmentService.bookAppointment(userId, data);
      res.status(201).json(appointment);
    } catch (err: unknown) {
      if ((err as { name?: string }).name === "ZodError") {
        res.status(400).json({ error: "Validation error", details: (err as { errors?: unknown }).errors });
      } else {
        res.status(400).json({ error: (err as Error).message });
      }
    }
  }

  /**
   * Get patient appointments
   */
  static async getPatientAppointments(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const query = listAppointmentsSchema.parse(req.query || {});
      const appointments = await AppointmentService.getPatientAppointments(userId, query);
      res.json(appointments);
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  /**
   * Get provider appointments
   */
  static async getProviderAppointments(req: AuthRequest, res: Response): Promise<void> {
    try {
      const providerUserId = req.user!.id;
      const query = listAppointmentsSchema.parse(req.query || {});
      const appointments = await AppointmentService.getProviderAppointments(providerUserId, query);
      res.json(appointments);
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  }

  /**
   * Get hospital appointments (Tenant-scoped)
   */
  static async getHospitalAppointments(req: AuthRequest, res: Response): Promise<void> {
    try {
      const hospitalId = req.params.hospitalId as string;
      const userId = req.user!.id;
      const query = listAppointmentsSchema.parse(req.query || {});
      const appointments = await AppointmentService.getHospitalAppointments(hospitalId, userId, query);
      res.json(appointments);
    } catch (err: unknown) {
      res.status(403).json({ error: (err as Error).message });
    }
  }

  /**
   * Cancel appointment
   */
  static async cancelAppointment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const appointmentId = req.params.appointmentId as string;
      const data = cancelAppointmentSchema.parse(req.body || {});
      const updated = await AppointmentService.cancelAppointment(userId, appointmentId, data.reason ?? undefined);
      res.json(updated);
    } catch (err: unknown) {
      res.status(400).json({ error: (err as Error).message });
    }
  }

  /**
   * Reschedule appointment
   */
  static async rescheduleAppointment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const appointmentId = req.params.appointmentId as string;
      const data = rescheduleAppointmentSchema.parse(req.body);
      const updated = await AppointmentService.rescheduleAppointment(userId, appointmentId, data);
      res.json(updated);
    } catch (err: unknown) {
      if ((err as { name?: string }).name === "ZodError") {
        res.status(400).json({ error: "Validation error", details: (err as { errors?: unknown }).errors });
      } else {
        res.status(400).json({ error: (err as Error).message });
      }
    }
  }

  /**
   * Check in appointment -> Encounter linkage
   */
  static async checkInAppointment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const appointmentId = req.params.appointmentId as string;
      const result = await AppointmentService.checkInAppointment(userId, appointmentId);
      res.json(result);
    } catch (err: unknown) {
      res.status(400).json({ error: (err as Error).message });
    }
  }
}
