import { databaseClient } from "../config/database.js";
import { 
  AppointmentStatus, 
  AuditAction, 
  NotificationType,
  EncounterType,
  EncounterStatus
} from "../generated/prisma/enums.js";
import { notificationService } from "./notification.service.js";

const prisma = databaseClient.getClient();

export class AppointmentService {
  /**
   * Discover eligible doctors / providers across hospitals
   */
  static async discoverProviders(query: { search?: string; specialty?: string; hospitalId?: string }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      user: { status: "ACTIVE" }
    };

    if (query.specialty) {
      where.specialty = { contains: query.specialty, mode: "insensitive" };
    }

    if (query.search) {
      where.OR = [
        { specialty: { contains: query.search, mode: "insensitive" } },
        { registrationNumber: { contains: query.search, mode: "insensitive" } },
        { user: { email: { contains: query.search, mode: "insensitive" } } },
        { user: { patientProfile: { firstName: { contains: query.search, mode: "insensitive" } } } },
        { user: { patientProfile: { lastName: { contains: query.search, mode: "insensitive" } } } }
      ];
    }

    const doctors = await prisma.doctorProfile.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            hospitalMemberships: {
              where: { status: "ACTIVE", role: "DOCTOR" },
              include: {
                hospital: true,
                department: true
              }
            }
          }
        }
      }
    });

    // Filter by hospitalId if provided
    let results = doctors.map(doc => {
      const activeHospitals = doc.user.hospitalMemberships.map(m => ({
        hospitalId: m.hospitalId,
        hospitalName: m.hospital.name,
        hospitalCode: m.hospital.code,
        departmentId: m.departmentId,
        departmentName: m.department?.name || null
      }));

      return {
        doctorId: doc.id,
        userId: doc.userId,
        registrationNumber: doc.registrationNumber,
        specialty: doc.specialty || "General Medicine",
        verificationStatus: doc.verificationStatus,
        email: doc.user.email,
        hospitals: activeHospitals
      };
    });

    if (query.hospitalId) {
      results = results.filter(doc => doc.hospitals.some(h => h.hospitalId === query.hospitalId));
    }

    return results;
  }

  /**
   * Get provider availability slots for a specific date
   */
  static async getProviderAvailability(doctorId: string, hospitalId: string, dateStr: string) {
    const doctor = await prisma.doctorProfile.findUnique({
      where: { id: doctorId },
      include: { user: true }
    });
    if (!doctor) throw new Error("Doctor not found");

    const hospital = await prisma.hospital.findUnique({
      where: { id: hospitalId }
    });
    if (!hospital) throw new Error("Hospital not found");

    // Standard business hours: 09:00 to 17:00 (30 min slots), skipping lunch 13:00-14:00
    const defaultSlots = [
      { startTime: "09:00", endTime: "09:30" },
      { startTime: "09:30", endTime: "10:00" },
      { startTime: "10:00", endTime: "10:30" },
      { startTime: "10:30", endTime: "11:00" },
      { startTime: "11:00", endTime: "11:30" },
      { startTime: "11:30", endTime: "12:00" },
      { startTime: "12:00", endTime: "12:30" },
      { startTime: "12:30", endTime: "13:00" },
      { startTime: "14:00", endTime: "14:30" },
      { startTime: "14:30", endTime: "15:00" },
      { startTime: "15:00", endTime: "15:30" },
      { startTime: "15:30", endTime: "16:00" },
      { startTime: "16:00", endTime: "16:30" },
      { startTime: "16:30", endTime: "17:00" }
    ];

    const targetDate = new Date(dateStr + "T00:00:00.000Z");
    const startOfDay = new Date(dateStr + "T00:00:00.000Z");
    const endOfDay = new Date(dateStr + "T23:59:59.999Z");

    const existingAppointments = await prisma.appointment.findMany({
      where: {
        doctorId,
        hospitalId,
        appointmentDate: {
          gte: startOfDay,
          lte: endOfDay
        },
        status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] }
      }
    });

    const bookedTimes = new Set(existingAppointments.map(a => a.startTime));

    return {
      doctorId,
      hospitalId,
      date: dateStr,
      slots: defaultSlots.map(slot => ({
        ...slot,
        available: !bookedTimes.has(slot.startTime)
      }))
    };
  }

  /**
   * Book an appointment with transaction-level double-booking prevention
   */
  static async bookAppointment(
    patientUserId: string,
    data: {
      hospitalId: string;
      doctorId: string;
      departmentId?: string | null | undefined;
      appointmentDate: string;
      startTime: string;
      endTime: string;
      reason?: string | null | undefined;
      notes?: string | null | undefined;
    }
  ) {
    const patientProfile = await prisma.patientProfile.findUnique({
      where: { userId: patientUserId }
    });
    if (!patientProfile) throw new Error("Patient profile not found");

    const slotTimestamp = new Date(`${data.appointmentDate}T${data.startTime}:00.000Z`);

    // Run transaction to enforce strict concurrency / slot isolation
    const appointment = await prisma.$transaction(async (tx) => {
      // 1. Double-booking check: Verify no active appointment exists for doctor at same slot timestamp
      const existing = await tx.appointment.findFirst({
        where: {
          doctorId: data.doctorId,
          slotTimestamp: slotTimestamp,
          status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] }
        }
      });

      if (existing) {
        throw new Error("Slot is no longer available. Please choose another time slot.");
      }

      // 2. Verify Doctor & Hospital
      const doctor = await tx.doctorProfile.findUnique({
        where: { id: data.doctorId },
        include: { user: true }
      });
      if (!doctor) throw new Error("Doctor not found");

      const hospital = await tx.hospital.findUnique({
        where: { id: data.hospitalId }
      });
      if (!hospital) throw new Error("Hospital not found");

      // 3. Create Appointment
      const appt = await tx.appointment.create({
        data: {
          patientId: patientProfile.id,
          hospitalId: data.hospitalId,
          departmentId: data.departmentId || null,
          doctorId: data.doctorId,
          appointmentDate: new Date(data.appointmentDate + "T00:00:00.000Z"),
          startTime: data.startTime,
          endTime: data.endTime,
          slotTimestamp,
          status: AppointmentStatus.SCHEDULED,
          reason: data.reason || null,
          notes: data.notes || null,
        },
        include: {
          patient: true,
          hospital: true,
          department: true,
          doctor: { include: { user: true } }
        }
      });

      // 4. Audit Log
      await tx.auditLog.create({
        data: {
          actorUserId: patientUserId,
          action: AuditAction.APPOINTMENT_BOOKED,
          targetType: "Appointment",
          targetId: appt.id,
          metadata: {
            hospitalId: data.hospitalId,
            doctorId: data.doctorId,
            slotTimestamp
          }
        }
      });

      return appt;
    }, { timeout: 15000 });

    // 5. In-App Notifications (Free)
    await notificationService.createNotification({
      userId: patientUserId,
      type: NotificationType.APPOINTMENT_BOOKED,
      title: "Appointment Booked",
      message: `Your appointment at ${appointment.hospital.name} for ${data.appointmentDate} at ${data.startTime} is scheduled.`,
      relatedResource: { type: "Appointment", id: appointment.id }
    });

    if (appointment.doctor?.userId) {
      await notificationService.createNotification({
        userId: appointment.doctor.userId,
        type: NotificationType.APPOINTMENT_BOOKED,
        title: "New Appointment Scheduled",
        message: `A new appointment was booked by a patient for ${data.appointmentDate} at ${data.startTime}.`,
        relatedResource: { type: "Appointment", id: appointment.id }
      });
    }

    return appointment;
  }

  /**
   * List appointments for patient
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async getPatientAppointments(userId: string, query: any) {
    const patientProfile = await prisma.patientProfile.findUnique({
      where: { userId }
    });
    if (!patientProfile) throw new Error("Patient profile not found");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { patientId: patientProfile.id };
    if (query.status) where.status = query.status;

    if (query.dateFrom || query.dateTo) {
      where.appointmentDate = {};
      if (query.dateFrom) where.appointmentDate.gte = new Date(query.dateFrom + "T00:00:00.000Z");
      if (query.dateTo) where.appointmentDate.lte = new Date(query.dateTo + "T23:59:59.999Z");
    }

    return prisma.appointment.findMany({
      where,
      include: {
        hospital: true,
        department: true,
        doctor: { include: { user: true } },
        encounter: true
      },
      orderBy: { slotTimestamp: "asc" }
    });
  }

  /**
   * List appointments for doctor / provider
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async getProviderAppointments(providerUserId: string, query: any) {
    const doctorProfile = await prisma.doctorProfile.findUnique({
      where: { userId: providerUserId }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (doctorProfile) {
      where.OR = [
        { doctorId: doctorProfile.id },
        { doctorId: null }
      ];
    } else {
      where.doctorId = "00000000-0000-0000-0000-000000000000"; // Return empty if not doctor
    }

    if (query.status) where.status = query.status;

    if (query.dateFrom || query.dateTo) {
      where.appointmentDate = {};
      if (query.dateFrom) where.appointmentDate.gte = new Date(query.dateFrom + "T00:00:00.000Z");
      if (query.dateTo) where.appointmentDate.lte = new Date(query.dateTo + "T23:59:59.999Z");
    }

    return prisma.appointment.findMany({
      where,
      include: {
        patient: true,
        hospital: true,
        department: true,
        encounter: true
      },
      orderBy: { slotTimestamp: "asc" }
    });
  }

  /**
   * List hospital appointments (Tenant Isolated)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async getHospitalAppointments(hospitalId: string, requestingUserId: string, query: any) {
    const membership = await prisma.hospitalMembership.findFirst({
      where: { userId: requestingUserId, hospitalId, status: "ACTIVE" }
    });
    if (!membership) throw new Error("Unauthorized: Active hospital membership required");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { hospitalId };
    if (query.status) where.status = query.status;

    return prisma.appointment.findMany({
      where,
      include: {
        patient: true,
        department: true,
        doctor: { include: { user: true } },
        encounter: true
      },
      orderBy: { slotTimestamp: "asc" }
    });
  }

  /**
   * Cancel an appointment
   */
  static async cancelAppointment(userId: string, appointmentId: string, reason?: string) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: true,
        doctor: { include: { user: true } }
      }
    });

    if (!appointment) throw new Error("Appointment not found");

    // Check authorization: must be the booking patient, assigned doctor, or hospital staff
    const patientProfile = await prisma.patientProfile.findUnique({ where: { userId } });
    const isPatientOwner = patientProfile && appointment.patientId === patientProfile.id;
    const isDoctorAssigned = appointment.doctor && appointment.doctor.userId === userId;
    const hospitalMembership = await prisma.hospitalMembership.findFirst({
      where: { userId, hospitalId: appointment.hospitalId, status: "ACTIVE" }
    });

    if (!isPatientOwner && !isDoctorAssigned && !hospitalMembership) {
      throw new Error("Unauthorized: You do not have permission to cancel this appointment");
    }

    if (appointment.status === AppointmentStatus.COMPLETED || appointment.status === AppointmentStatus.CANCELLED) {
      throw new Error(`Cannot cancel appointment with status ${appointment.status}`);
    }

    const updated = await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: AppointmentStatus.CANCELLED,
        cancelledReason: reason || "Cancelled by user"
      }
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: userId,
        action: AuditAction.APPOINTMENT_CANCELLED,
        targetType: "Appointment",
        targetId: appointmentId,
        metadata: { reason }
      }
    });

    // Notifications
    if (!isPatientOwner && appointment.patient.userId) {
      await notificationService.createNotification({
        userId: appointment.patient.userId,
        type: NotificationType.APPOINTMENT_CANCELLED,
        title: "Appointment Cancelled",
        message: `Your appointment has been cancelled. Reason: "${reason || 'No reason provided'}".`,
        relatedResource: { type: "Appointment", id: appointmentId }
      });
    }

    if (!isDoctorAssigned && appointment.doctor?.userId) {
      await notificationService.createNotification({
        userId: appointment.doctor.userId,
        type: NotificationType.APPOINTMENT_CANCELLED,
        title: "Appointment Cancelled",
        message: `An appointment scheduled for ${appointment.startTime} was cancelled.`,
        relatedResource: { type: "Appointment", id: appointmentId }
      });
    }

    return updated;
  }

  /**
   * Reschedule an appointment
   */
  static async rescheduleAppointment(
    userId: string,
    appointmentId: string,
    data: { appointmentDate: string; startTime: string; endTime: string }
  ) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { patient: true }
    });

    if (!appointment) throw new Error("Appointment not found");

    const patientProfile = await prisma.patientProfile.findUnique({ where: { userId } });
    if (!patientProfile || appointment.patientId !== patientProfile.id) {
      throw new Error("Unauthorized: Only the booking patient can reschedule");
    }

    if (appointment.status === AppointmentStatus.COMPLETED || appointment.status === AppointmentStatus.CANCELLED) {
      throw new Error(`Cannot reschedule appointment with status ${appointment.status}`);
    }

    const newSlotTimestamp = new Date(`${data.appointmentDate}T${data.startTime}:00.000Z`);

    // Verify slot availability
    const existing = await prisma.appointment.findFirst({
      where: {
        doctorId: appointment.doctorId,
        slotTimestamp: newSlotTimestamp,
        id: { not: appointmentId },
        status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] }
      }
    });

    if (existing) {
      throw new Error("Slot is no longer available. Please choose another time slot.");
    }

    const updated = await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        appointmentDate: new Date(data.appointmentDate + "T00:00:00.000Z"),
        startTime: data.startTime,
        endTime: data.endTime,
        slotTimestamp: newSlotTimestamp,
        status: AppointmentStatus.SCHEDULED
      }
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: userId,
        action: AuditAction.APPOINTMENT_RESCHEDULED,
        targetType: "Appointment",
        targetId: appointmentId
      }
    });

    return updated;
  }

  /**
   * Check-in appointment and seamlessly link / create Encounter
   */
  static async checkInAppointment(providerOrStaffUserId: string, appointmentId: string) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { hospital: true, patient: true }
    });

    if (!appointment) throw new Error("Appointment not found");

    // Verify authorization
    const doctorProfile = await prisma.doctorProfile.findUnique({ where: { userId: providerOrStaffUserId } });
    const isAssignedDoctor = doctorProfile && appointment.doctorId === doctorProfile.id;
    const hospitalMembership = await prisma.hospitalMembership.findFirst({
      where: { userId: providerOrStaffUserId, hospitalId: appointment.hospitalId, status: "ACTIVE" }
    });

    if (!isAssignedDoctor && !hospitalMembership) {
      throw new Error("Unauthorized: Staff or Doctor membership in this hospital required");
    }

    if (appointment.status === AppointmentStatus.COMPLETED || appointment.status === AppointmentStatus.CANCELLED) {
      throw new Error(`Cannot check in appointment with status ${appointment.status}`);
    }

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create or reference Encounter
      let encounterId = appointment.encounterId;
      if (!encounterId) {
        const encounter = await tx.encounter.create({
          data: {
            patientId: appointment.patientId,
            hospitalId: appointment.hospitalId,
            departmentId: appointment.departmentId ?? null,
            providerId: isAssignedDoctor ? providerOrStaffUserId : null,
            type: EncounterType.OUTPATIENT,
            status: EncounterStatus.CHECKED_IN,
            reason: appointment.reason || "Appointment Visit",
            startedAt: now
          }
        });
        encounterId = encounter.id;
      } else {
        await tx.encounter.update({
          where: { id: encounterId },
          data: {
            status: EncounterStatus.CHECKED_IN,
            startedAt: now
          }
        });
      }

      // 2. Update Appointment Status
      const updatedAppt = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          status: AppointmentStatus.CHECKED_IN,
          encounterId
        },
        include: { encounter: true }
      });

      // 3. Audit Log
      await tx.auditLog.create({
        data: {
          actorUserId: providerOrStaffUserId,
          action: AuditAction.APPOINTMENT_CHECKED_IN,
          targetType: "Appointment",
          targetId: appointmentId,
          metadata: { encounterId }
        }
      });

      return updatedAppt;
    }, { timeout: 15000 });

    return result;
  }
}
