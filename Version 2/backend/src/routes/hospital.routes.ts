import { Router } from "express";
import { HospitalController } from "../controllers/hospital.controller.js";
import { EncounterController } from "../controllers/encounter.controller.js";
import { HospitalRegistrationController } from "../controllers/hospital-registration.controller.js";
import { HospitalOnboardingController } from "../controllers/hospital-onboarding.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorizeTenant } from "../middleware/rbac.middleware.js";
import { MembershipRole } from "../generated/prisma/enums.js";

const router = Router();

// Public / Unauthenticated Onboarding & Invitation Endpoints
router.post("/register", HospitalOnboardingController.registerHospital);
router.get("/invitations/verify", HospitalOnboardingController.verifyInvitationToken);
router.post("/invitations/accept", HospitalOnboardingController.acceptInvitation);

// Protect all remaining routes
router.use(authenticate);

// Get all hospitals for the authenticated user
router.get("/", HospitalController.getHospitals);

// Doctor & Staff Invitations (Hospital Admin)
router.post(
  "/:hospitalId/invitations",
  authorizeTenant([MembershipRole.HOSPITAL_ADMIN]),
  HospitalOnboardingController.inviteDoctorOrStaff
);

router.get(
  "/:hospitalId/invitations",
  authorizeTenant([MembershipRole.HOSPITAL_ADMIN]),
  HospitalOnboardingController.getHospitalInvitations
);

// Organization-scoped endpoints - require active membership in the requested hospital
router.get(
  "/:hospitalId",
  authorizeTenant(),
  HospitalController.getHospitalDetails
);

// Hospital Settings
router.patch(
  "/:hospitalId",
  authorizeTenant([MembershipRole.HOSPITAL_ADMIN]),
  HospitalController.updateHospitalSettings
);

// Departments Management
router.get(
  "/:hospitalId/departments",
  authorizeTenant(),
  HospitalController.getDepartments
);

router.post(
  "/:hospitalId/departments",
  authorizeTenant([MembershipRole.HOSPITAL_ADMIN]),
  HospitalController.createDepartment
);

router.patch(
  "/:hospitalId/departments/:departmentId",
  authorizeTenant([MembershipRole.HOSPITAL_ADMIN]),
  HospitalController.updateDepartment
);

// Only admins can view all members
router.get(
  "/:hospitalId/members",
  authorizeTenant([MembershipRole.HOSPITAL_ADMIN]),
  HospitalController.getMembers
);

router.post(
  "/:hospitalId/members",
  authorizeTenant([MembershipRole.HOSPITAL_ADMIN]),
  HospitalController.addMember
);

router.patch(
  "/:hospitalId/members/:membershipId",
  authorizeTenant([MembershipRole.HOSPITAL_ADMIN]),
  HospitalController.updateMember
);

router.delete(
  "/:hospitalId/members/:membershipId",
  authorizeTenant([MembershipRole.HOSPITAL_ADMIN]),
  HospitalController.removeMember
);

// Hospital Operations: Master Appointments Queue & Hospital-Scoped Patient Directory
router.get(
  "/:hospitalId/appointments",
  authorizeTenant([MembershipRole.HOSPITAL_ADMIN, MembershipRole.STAFF, MembershipRole.DOCTOR]),
  HospitalController.getHospitalAppointments
);

router.get(
  "/:hospitalId/patients",
  authorizeTenant([MembershipRole.HOSPITAL_ADMIN, MembershipRole.STAFF, MembershipRole.DOCTOR]),
  HospitalController.getHospitalPatients
);

// Hospital Registration (QR resolution)
router.post(
  "/:hospitalId/registration/consume",
  authorizeTenant([MembershipRole.HOSPITAL_ADMIN, MembershipRole.STAFF]),
  HospitalRegistrationController.consumeRegistrationToken
);

// Encounters
router.post(
  "/:hospitalId/encounters",
  authorizeTenant([MembershipRole.HOSPITAL_ADMIN, MembershipRole.STAFF]),
  EncounterController.createHospitalEncounter
);

router.get(
  "/:hospitalId/encounters",
  authorizeTenant(),
  EncounterController.getHospitalEncounters
);

router.patch(
  "/:hospitalId/encounters/:encounterId",
  authorizeTenant([MembershipRole.HOSPITAL_ADMIN, MembershipRole.STAFF]),
  EncounterController.updateEncounter
);

export default router;
