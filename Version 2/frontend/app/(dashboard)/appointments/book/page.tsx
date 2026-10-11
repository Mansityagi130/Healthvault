"use client";

import { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/api-client";
import { useRouter } from "next/navigation";
import { Search, Calendar, Clock, MapPin, Stethoscope, CheckCircle, AlertCircle } from "lucide-react";

interface Doctor {
  doctorId: string;
  userId: string;
  registrationNumber: string;
  specialty: string;
  verificationStatus: string;
  email: string;
  hospitals: {
    hospitalId: string;
    hospitalName: string;
    hospitalCode: string;
    departmentId?: string;
    departmentName?: string;
  }[];
}

interface Slot {
  startTime: string;
  endTime: string;
  available: boolean;
}

interface Availability {
  doctorId: string;
  hospitalId: string;
  date: string;
  slots: Slot[];
}

export default function BookAppointmentPage() {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [providers, setProviders] = useState<Doctor[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);

  // Booking Modal Selection State
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [selectedHospitalId, setSelectedHospitalId] = useState("");
  const [appointmentDate, setAppointmentDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  });
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [reason, setReason] = useState("");
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    searchProviders();
  }, [specialty]);

  async function searchProviders() {
    setLoadingProviders(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (specialty) params.append("specialty", specialty);

      const res = await fetchWithAuth(`/appointments/providers?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setProviders(data || []);
      }
    } catch (err) {
      console.error("Failed to fetch providers", err);
    } finally {
      setLoadingProviders(false);
    }
  }

  async function loadSlots(docId: string, hospId: string, dateStr: string) {
    setLoadingSlots(true);
    setError(null);
    try {
      const res = await fetchWithAuth(
        `/appointments/availability?doctorId=${docId}&hospitalId=${hospId}&date=${dateStr}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load availability slots.");
      setAvailability(data);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Error handling
    } catch (err: any) {
      setError(err.message || "Failed to load availability slots.");
    } finally {
      setLoadingSlots(false);
    }
  }

  function handleOpenBooking(doc: Doctor) {
    setSelectedDoctor(doc);
    const firstHospId = doc.hospitals[0]?.hospitalId || "";
    setSelectedHospitalId(firstHospId);
    setSelectedSlot(null);
    if (firstHospId) {
      loadSlots(doc.doctorId, firstHospId, appointmentDate);
    }
  }

  async function handleConfirmBooking() {
    if (!selectedDoctor || !selectedHospitalId || !selectedSlot) {
      setError("Please select a doctor, hospital, and time slot.");
      return;
    }

    setBooking(true);
    setError(null);
    try {
      const hosp = selectedDoctor.hospitals.find(h => h.hospitalId === selectedHospitalId);
      const res = await fetchWithAuth("/appointments/book", {
        method: "POST",
        body: JSON.stringify({
          hospitalId: selectedHospitalId,
          doctorId: selectedDoctor.doctorId,
          departmentId: hosp?.departmentId || undefined,
          appointmentDate,
          startTime: selectedSlot.startTime,
          endTime: selectedSlot.endTime,
          reason
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to book appointment.");

      alert("Appointment successfully booked!");
      router.push("/appointments");
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Error handling
    } catch (err: any) {
      setError(err.message || "Failed to book appointment.");
    } finally {
      setBooking(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Stethoscope className="w-7 h-7 text-blue-600" />
          Discover Providers & Book Appointment
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Search verified doctors, select hospital locations, and book real-time available slots.
        </p>
      </div>

      {/* Search Bar & Filters */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search by doctor name, specialty, or hospital code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchProviders()}
            className="w-full pl-10 border border-slate-300 rounded-lg p-2.5 text-sm"
          />
        </div>
        <select
          value={specialty}
          onChange={(e) => setSpecialty(e.target.value)}
          className="border border-slate-300 rounded-lg p-2.5 text-sm bg-white"
        >
          <option value="">All Specialties</option>
          <option value="Cardiology">Cardiology</option>
          <option value="General Medicine">General Medicine</option>
          <option value="Emergency Medicine">Emergency Medicine</option>
          <option value="Orthopedics">Orthopedics</option>
          <option value="Pediatrics">Pediatrics</option>
        </select>
        <button
          onClick={searchProviders}
          className="bg-blue-600 text-white font-semibold px-5 py-2.5 rounded-lg text-sm"
        >
          Search
        </button>
      </div>

      {/* Doctor Results Grid */}
      {loadingProviders ? (
        <div className="p-8 text-center text-slate-500">Searching verified providers...</div>
      ) : providers.length === 0 ? (
        <div className="p-8 text-center bg-white rounded-xl border text-slate-500">
          No providers found matching your search query.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {providers.map((doc) => (
            <div key={doc.doctorId} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4 flex flex-col justify-between hover:border-blue-300 transition">
              <div className="space-y-2">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-slate-900 text-base">{doc.email}</h3>
                  <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-semibold border border-emerald-200">
                    VERIFIED
                  </span>
                </div>

                <div className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded inline-block">
                  {doc.specialty}
                </div>

                <div className="text-2xs text-slate-400 font-mono">
                  Reg No: {doc.registrationNumber}
                </div>

                <div className="pt-2 border-t border-slate-100 text-xs text-slate-600 space-y-1">
                  <div className="font-semibold text-slate-700">Associated Hospitals:</div>
                  {doc.hospitals.map(h => (
                    <div key={h.hospitalId} className="flex items-center gap-1.5 text-slate-600">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>{h.hospitalName}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => handleOpenBooking(doc)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg text-xs transition"
              >
                Select & Book Slot
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Booking Slot Selection Modal / Workspace */}
      {selectedDoctor && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Book Appointment Slot</h2>
                <p className="text-xs text-slate-500">Doctor: {selectedDoctor.email} ({selectedDoctor.specialty})</p>
              </div>
              <button
                onClick={() => setSelectedDoctor(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl"
              >
                ×
              </button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Hospital Location</label>
                <select
                  value={selectedHospitalId}
                  onChange={(e) => {
                    setSelectedHospitalId(e.target.value);
                    loadSlots(selectedDoctor.doctorId, e.target.value, appointmentDate);
                  }}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                >
                  {selectedDoctor.hospitals.map(h => (
                    <option key={h.hospitalId} value={h.hospitalId}>{h.hospitalName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Appointment Date</label>
                <input
                  type="date"
                  value={appointmentDate}
                  onChange={(e) => {
                    setAppointmentDate(e.target.value);
                    loadSlots(selectedDoctor.doctorId, selectedHospitalId, e.target.value);
                  }}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>
            </div>

            {/* Time Slots Grid */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase">Available Time Slots</label>
              {loadingSlots ? (
                <div className="p-4 text-center text-xs text-slate-500">Checking slot availability...</div>
              ) : !availability ? (
                <div className="p-4 text-center text-xs text-slate-500">Select hospital & date to load slots.</div>
              ) : (
                <div className="grid grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1">
                  {availability.slots.map((slot) => {
                    const isSelected = selectedSlot?.startTime === slot.startTime;
                    return (
                      <button
                        key={slot.startTime}
                        disabled={!slot.available}
                        onClick={() => setSelectedSlot(slot)}
                        className={`p-2 text-xs font-semibold rounded-lg border text-center transition ${
                          !slot.available
                            ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed line-through"
                            : isSelected
                            ? "bg-blue-600 text-white border-blue-600 shadow"
                            : "bg-white text-slate-700 border-slate-300 hover:border-blue-400"
                        }`}
                      >
                        {slot.startTime} - {slot.endTime}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Reason for Visit (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Routine checkup, follow-up, chest pain"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2 text-xs"
              />
            </div>

            <div className="pt-3 border-t flex gap-3">
              <button
                onClick={() => setSelectedDoctor(null)}
                className="flex-1 bg-slate-100 text-slate-700 font-semibold py-2 rounded-lg text-xs"
              >
                Cancel
              </button>
              <button
                disabled={!selectedSlot || booking}
                onClick={handleConfirmBooking}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg text-xs transition disabled:bg-slate-300"
              >
                {booking ? "Confirming Booking..." : "Confirm & Book Slot"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
