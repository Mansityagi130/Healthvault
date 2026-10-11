"use client";

import { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/api-client";
import { Calendar, Clock, MapPin, User, CheckCircle, Search } from "lucide-react";

interface Appointment {
  id: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: string;
  reason?: string;
  patient: {
    firstName?: string;
    lastName?: string;
  };
  doctor?: {
    user: {
      email: string;
    };
  };
  department?: {
    name: string;
  };
  encounter?: {
    id: string;
    status: string;
  };
}

interface Hospital {
  id: string;
  name: string;
}

export default function HospitalAppointmentsPage() {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [selectedHospitalId, setSelectedHospitalId] = useState("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHospitals();
  }, []);

  useEffect(() => {
    if (selectedHospitalId) {
      loadHospitalAppointments(selectedHospitalId);
    }
  }, [selectedHospitalId]);

  async function loadHospitals() {
    try {
      const res = await fetchWithAuth("/hospitals");
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          setHospitals(data);
          setSelectedHospitalId(data[0].id);
        } else {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error("Failed to load user hospitals", err);
      setLoading(false);
    }
  }

  async function loadHospitalAppointments(hospId: string) {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/appointments/hospital/${hospId}`);
      if (res.ok) {
        const data = await res.json();
        setAppointments(data || []);
      }
    } catch (err) {
      console.error("Failed to load hospital appointments", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b pb-4 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-7 h-7 text-blue-600" />
            Hospital Appointments Management
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            View scheduled patient visits, department allocations, and encounter linkages.
          </p>
        </div>

        {hospitals.length > 1 && (
          <select
            value={selectedHospitalId}
            onChange={(e) => setSelectedHospitalId(e.target.value)}
            className="border border-slate-300 rounded-lg p-2.5 text-sm bg-white font-semibold"
          >
            {hospitals.map(h => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-500">Loading hospital appointments...</div>
      ) : appointments.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
          No appointments recorded for this hospital organization.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b uppercase text-3xs tracking-wider">
              <tr>
                <th className="p-3.5">Patient</th>
                <th className="p-3.5">Doctor</th>
                <th className="p-3.5">Department</th>
                <th className="p-3.5">Date & Time</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5">Encounter</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {appointments.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50 transition">
                  <td className="p-3.5 font-semibold text-slate-900">
                    {`${a.patient.firstName || ''} ${a.patient.lastName || ''}`.trim() || "Patient"}
                  </td>
                  <td className="p-3.5">{a.doctor?.user?.email || "Unassigned"}</td>
                  <td className="p-3.5">{a.department?.name || "-"}</td>
                  <td className="p-3.5 whitespace-nowrap">
                    {new Date(a.appointmentDate).toLocaleDateString()} {a.startTime}
                  </td>
                  <td className="p-3.5">
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 font-semibold rounded-full border border-blue-100">
                      {a.status}
                    </span>
                  </td>
                  <td className="p-3.5 font-mono text-3xs">
                    {a.encounter ? (
                      <span className="text-emerald-700 font-semibold">Linked ({a.encounter.status})</span>
                    ) : (
                      <span className="text-slate-400">None</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
