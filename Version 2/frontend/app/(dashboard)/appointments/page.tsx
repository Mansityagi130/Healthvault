"use client";

import { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/api-client";
import Link from "next/link";
import { Calendar, Clock, MapPin, User, CheckCircle, XCircle, AlertCircle, PlusCircle, RefreshCw } from "lucide-react";

interface Appointment {
  id: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: string;
  reason?: string;
  cancelledReason?: string;
  hospital: {
    id: string;
    name: string;
  };
  department?: {
    id: string;
    name: string;
  };
  doctor?: {
    id: string;
    specialty?: string;
    user: {
      email: string;
    };
  };
  encounter?: {
    id: string;
    status: string;
  };
}

export default function PatientAppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    loadAppointments();
  }, []);

  async function loadAppointments() {
    setLoading(true);
    try {
      const res = await fetchWithAuth("/appointments/patient");
      if (res.ok) {
        const data = await res.json();
        setAppointments(data || []);
      }
    } catch (err) {
      console.error("Failed to load appointments", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelAppointment(id: string) {
    try {
      const res = await fetchWithAuth(`/appointments/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: cancelReason })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to cancel appointment");
      setCancellingId(null);
      setCancelReason("");
      loadAppointments();
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Error handling
    } catch (err: any) {
      alert(err.message || "Failed to cancel appointment");
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "SCHEDULED":
        return <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold rounded-full">Scheduled</span>;
      case "CONFIRMED":
        return <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-semibold rounded-full">Confirmed</span>;
      case "CHECKED_IN":
        return <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold rounded-full flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Checked In</span>;
      case "COMPLETED":
        return <span className="px-2.5 py-1 bg-gray-100 text-gray-700 border border-gray-200 text-xs font-semibold rounded-full">Completed</span>;
      case "CANCELLED":
        return <span className="px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 text-xs font-semibold rounded-full flex items-center gap-1"><XCircle className="w-3 h-3"/> Cancelled</span>;
      default:
        return <span className="px-2.5 py-1 bg-gray-50 text-gray-600 text-xs rounded-full">{status}</span>;
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-7 h-7 text-blue-600" />
            My Appointments
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            View upcoming doctor appointments, hospital visits, check-in status, and book new slots.
          </p>
        </div>
        <Link
          href="/appointments/book"
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2.5 rounded-lg flex items-center gap-2 shadow text-sm transition"
        >
          <PlusCircle className="w-5 h-5" />
          Book New Appointment
        </Link>
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-500">Loading appointments...</div>
      ) : appointments.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-4">
          <Calendar className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-lg font-bold text-slate-800">No Appointments Scheduled</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            You don't have any appointments booked. Discover verified doctors and hospitals to schedule a visit.
          </p>
          <Link
            href="/appointments/book"
            className="inline-flex items-center gap-2 bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg text-sm"
          >
            Find Doctor & Book Slot
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {appointments.map((appt) => (
            <div key={appt.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
                    <User className="w-5 h-5 text-blue-600" />
                    <span>{appt.doctor?.user?.email || "General Practitioner"}</span>
                  </div>
                  {getStatusBadge(appt.status)}
                </div>

                {appt.doctor?.specialty && (
                  <div className="text-xs text-blue-600 font-medium bg-blue-50 px-2.5 py-0.5 rounded-md inline-block">
                    {appt.doctor.specialty}
                  </div>
                )}

                <div className="space-y-1.5 text-xs text-slate-600 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    <span className="font-semibold text-slate-800">{appt.hospital.name}</span>
                    {appt.department && <span className="text-slate-500">({appt.department.name})</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span>{new Date(appt.appointmentDate).toLocaleDateString()} at <strong className="text-slate-800">{appt.startTime} - {appt.endTime}</strong></span>
                  </div>
                  {appt.reason && (
                    <div className="text-slate-500 italic pt-1">
                      Reason: "{appt.reason}"
                    </div>
                  )}
                </div>

                {appt.encounter && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-2 rounded-lg flex items-center justify-between">
                    <span>Clinical Encounter Linked</span>
                    <span className="font-mono text-3xs">{appt.encounter.status}</span>
                  </div>
                )}
              </div>

              {appt.status !== "CANCELLED" && appt.status !== "COMPLETED" && (
                <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                  {cancellingId === appt.id ? (
                    <div className="w-full space-y-2">
                      <input
                        type="text"
                        placeholder="Reason for cancellation"
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        className="w-full text-xs border border-slate-300 rounded p-1.5"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleCancelAppointment(appt.id)}
                          className="flex-1 bg-red-600 text-white text-xs font-semibold py-1 rounded"
                        >
                          Confirm Cancel
                        </button>
                        <button
                          onClick={() => setCancellingId(null)}
                          className="flex-1 bg-slate-200 text-slate-700 text-xs font-semibold py-1 rounded"
                        >
                          Keep Appointment
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setCancellingId(appt.id)}
                      className="text-xs text-red-600 hover:bg-red-50 border border-red-200 px-3 py-1.5 rounded font-medium transition"
                    >
                      Cancel Appointment
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
