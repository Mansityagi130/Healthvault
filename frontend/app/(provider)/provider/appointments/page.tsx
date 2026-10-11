"use client";

import { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/api-client";
import { useRouter } from "next/navigation";
import { Calendar, Clock, User, CheckCircle, MapPin, Stethoscope } from "lucide-react";

interface Appointment {
  id: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: string;
  reason?: string;
  patient: {
    id: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  };
  hospital: {
    id: string;
    name: string;
  };
  department?: {
    id: string;
    name: string;
  };
  encounter?: {
    id: string;
    status: string;
  };
}

export default function ProviderAppointmentsPage() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingInId, setCheckingInId] = useState<string | null>(null);

  useEffect(() => {
    loadProviderAppointments();
  }, []);

  async function loadProviderAppointments() {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/appointments/provider");
      if (res.ok) {
        const data = await res.json();
        setAppointments(data || []);
      }
    } catch (err) {
      console.error("Failed to load provider appointments", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckIn(id: string) {
    setCheckingInId(id);
    try {
      const res = await fetchWithAuth(`/appointments/${id}/check-in`, {
        method: "POST"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to check in appointment");

      alert("Patient checked in! Encounter established.");
      if (data.encounterId) {
        router.push(`/provider/encounters/${data.encounterId}`);
      } else {
        loadProviderAppointments();
      }
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Error handling
    } catch (err: any) {
      alert(err.message || "Failed to check in appointment");
    } finally {
      setCheckingInId(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Calendar className="w-7 h-7 text-blue-600" />
          Scheduled Appointments
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          View patient appointments assigned to you across your active hospital memberships and execute check-in.
        </p>
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-500">Loading scheduled appointments...</div>
      ) : appointments.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
          No appointments scheduled for your doctor profile.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {appointments.map((appt) => (
            <div key={appt.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 font-bold text-slate-900 text-base">
                    <User className="w-5 h-5 text-blue-600" />
                    <span>{`${appt.patient.firstName || ''} ${appt.patient.lastName || ''}`.trim() || "Scheduled Patient"}</span>
                  </div>
                  <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full border border-blue-200">
                    {appt.status}
                  </span>
                </div>

                <div className="space-y-1 text-xs text-slate-600 border-t pt-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-semibold">{appt.hospital.name}</span>
                    {appt.department && <span className="text-slate-400">({appt.department.name})</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>{new Date(appt.appointmentDate).toLocaleDateString()} at <strong>{appt.startTime} - {appt.endTime}</strong></span>
                  </div>
                  {appt.reason && (
                    <div className="text-slate-500 italic pt-1">
                      Reason: "{appt.reason}"
                    </div>
                  )}
                </div>

                {appt.encounter && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-2 rounded-lg flex items-center justify-between">
                    <span>Encounter Linked</span>
                    <span className="font-mono text-3xs">{appt.encounter.status}</span>
                  </div>
                )}
              </div>

              {appt.status !== "COMPLETED" && appt.status !== "CANCELLED" && (
                <div className="pt-3 border-t">
                  <button
                    disabled={checkingInId === appt.id}
                    onClick={() => handleCheckIn(appt.id)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 rounded-lg text-xs transition flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {checkingInId === appt.id ? "Checking In..." : "Check In & Start Visit Workspace"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
