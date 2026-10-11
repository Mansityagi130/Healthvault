"use client";

import { useState } from "react";
import { fetchWithAuth } from "@/lib/api-client";
import { ShieldAlert, AlertTriangle, UserCheck, HeartPulse, Stethoscope } from "lucide-react";

interface EmergencyData {
  patientName: string;
  bloodGroup?: string;
  allergies?: string[];
  emergencyMedications?: string[];
  criticalConditions?: string[];
  emergencyContact?: {
    name: string;
    relationship: string;
    phone: string;
  };
  emergencyEncounterId?: string | null;
}

export default function ProviderEmergencyAccessPage() {
  const [selector, setSelector] = useState("");
  const [token, setToken] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EmergencyData | null>(null);

  async function handleResolveAccess(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setData(null);

    if (!selector || !token || !reason) {
      setError("Please fill in Selector, Secret Token, and Break-Glass Reason.");
      return;
    }

    if (reason.trim().length < 5) {
      setError("Emergency break-glass reason must be at least 5 characters long.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetchWithAuth("/emergency/access/resolve", {
        method: "POST",
        body: JSON.stringify({
          selector: selector.trim(),
          token: token.trim(),
          reason: reason.trim()
        })
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || "Failed to resolve emergency access. Token may be invalid or expired.");
      setData(resData);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Error handling
    } catch (err: any) {
      setError(err.message || "Failed to resolve emergency access. Token may be invalid or expired.");
    } finally {
      setLoading(false);
    }
  }

  function parseQrInput(rawText: string) {
    try {
      const parsed = JSON.parse(rawText);
      if (parsed.selector) setSelector(parsed.selector);
      if (parsed.token) setToken(parsed.token);
    } catch {
      // Not JSON, assume manual entry
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="bg-red-700 text-white rounded-xl p-6 shadow-md flex items-center gap-4">
        <ShieldAlert className="w-10 h-10 flex-shrink-0 text-red-200" />
        <div>
          <h1 className="text-2xl font-bold">Emergency Break-Glass Access Portal</h1>
          <p className="text-sm text-red-100 mt-1">
            Authorized healthcare providers may access critical emergency medical data by resolving an emergency QR token.
          </p>
        </div>
      </div>

      {/* Break-Glass Form */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b pb-3">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          Emergency Token Verification & Audited Break-Glass Reason
        </h2>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleResolveAccess} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              QR Payload or Selector UUID
            </label>
            <input
              type="text"
              placeholder="Paste raw QR JSON or Selector UUID"
              value={selector}
              onChange={(e) => {
                setSelector(e.target.value);
                parseQrInput(e.target.value);
              }}
              className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Secret Token (Hex Secret)
            </label>
            <input
              type="password"
              placeholder="Hex secret token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Break-Glass Reason (Audited & Logged) *
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Patient unconscious in ER following acute asthma episode. Emergency treatment required."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
              required
            />
            <p className="text-3xs text-slate-500 mt-1">
              * This reason will be logged in the immutable AuditLog and notified to the patient.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg text-sm shadow transition flex items-center justify-center gap-2"
          >
            <ShieldAlert className="w-5 h-5" />
            {loading ? "Verifying Emergency Access..." : "Execute Break-Glass & View Emergency Data"}
          </button>
        </form>
      </div>

      {/* Emergency Data Display */}
      {data && (
        <div className="bg-white rounded-xl border-2 border-red-500 shadow-lg p-6 space-y-6 animate-fade-in">
          <div className="flex items-center justify-between border-b pb-4">
            <div>
              <span className="bg-red-100 text-red-800 text-xs font-bold px-2.5 py-1 rounded-full">
                EMERGENCY MEDICAL PROFILE
              </span>
              <h2 className="text-2xl font-bold text-slate-900 mt-2">{data.patientName}</h2>
            </div>
            {data.bloodGroup && (
              <div className="bg-red-600 text-white text-center px-4 py-2 rounded-xl">
                <div className="text-3xs font-semibold uppercase">Blood Group</div>
                <div className="text-xl font-extrabold">{data.bloodGroup}</div>
              </div>
            )}
          </div>

          {data.emergencyEncounterId && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3 rounded-lg flex items-center justify-between">
              <span>Emergency Encounter created automatically in your active hospital.</span>
              <span className="font-mono text-3xs">Encounter ID: {data.emergencyEncounterId}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Allergies */}
            <div className="p-4 bg-red-50 rounded-xl border border-red-100 space-y-2">
              <h3 className="text-sm font-bold text-red-900 flex items-center gap-2">
                <HeartPulse className="w-4 h-4 text-red-600" />
                Known Allergies
              </h3>
              {data.allergies && data.allergies.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {data.allergies.map((a, i) => (
                    <span key={i} className="bg-white text-red-700 text-xs font-semibold px-2 py-1 rounded border border-red-200">
                      {a}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">None reported.</p>
              )}
            </div>

            {/* Critical Conditions */}
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 space-y-2">
              <h3 className="text-sm font-bold text-amber-900 flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-amber-600" />
                Critical Conditions
              </h3>
              {data.criticalConditions && data.criticalConditions.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {data.criticalConditions.map((c, i) => (
                    <span key={i} className="bg-white text-amber-800 text-xs font-semibold px-2 py-1 rounded border border-amber-200">
                      {c}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">None reported.</p>
              )}
            </div>

            {/* Emergency Medications */}
            <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 space-y-2">
              <h3 className="text-sm font-bold text-blue-900">Current Emergency Medications</h3>
              {data.emergencyMedications && data.emergencyMedications.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {data.emergencyMedications.map((m, i) => (
                    <span key={i} className="bg-white text-blue-800 text-xs font-semibold px-2 py-1 rounded border border-blue-200">
                      {m}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">None reported.</p>
              )}
            </div>

            {/* Emergency Contact */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-slate-600" />
                Emergency Contact Person
              </h3>
              {data.emergencyContact ? (
                <div className="text-xs text-slate-700 space-y-1">
                  <div><span className="font-semibold">Name:</span> {data.emergencyContact.name}</div>
                  <div><span className="font-semibold">Relation:</span> {data.emergencyContact.relationship}</div>
                  <div><span className="font-semibold">Phone:</span> {data.emergencyContact.phone}</div>
                </div>
              ) : (
                <p className="text-xs text-slate-500">No emergency contact configured.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
