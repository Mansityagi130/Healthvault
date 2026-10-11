import { Router } from "express";
import { AppointmentController } from "../controllers/appointment.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

export const appointmentRouter = Router();

appointmentRouter.use(authenticate);

// Public / Patient Discovery & Availability
appointmentRouter.get("/providers", AppointmentController.discoverProviders);
appointmentRouter.get("/availability", AppointmentController.getAvailability);

// Patient Appointments
appointmentRouter.post("/book", AppointmentController.bookAppointment);
appointmentRouter.get("/patient", AppointmentController.getPatientAppointments);
appointmentRouter.post("/:appointmentId/cancel", AppointmentController.cancelAppointment);
appointmentRouter.post("/:appointmentId/reschedule", AppointmentController.rescheduleAppointment);

// Doctor & Hospital Appointments
appointmentRouter.get("/provider", AppointmentController.getProviderAppointments);
appointmentRouter.get("/hospital/:hospitalId", AppointmentController.getHospitalAppointments);
appointmentRouter.post("/:appointmentId/check-in", AppointmentController.checkInAppointment);

export default appointmentRouter;
