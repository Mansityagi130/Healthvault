"use client";

import { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/api-client";
import { QRCodeDisplay } from "@/components/ui/QRCodeDisplay";
import { AlertCircle, ShieldAlert, QrCode, RefreshCw, Trash2, UserCheck, HeartPulse, Download } from "lucide-react";

interface EmergencyProfile {
  bloodGroup?: string;
  allergies?: string[];
  emergencyMedications?: string[];
  criticalConditions?: string[];
  emergencyContact?: {
    name: string;
    relationship: string;
    phone: string;
  };
  isActive: boolean;
}

interface EmergencyQr {
  selector: string;
  expiresAt: string;
  usageMode: string;
  useCount: number;
}

interface AccessHistory {
  id: string;
  accessedAt: string;
  actorName: string;
  doctorSpecialty?: string;
  reason: string;
  outcome: string;
}

export default function PatientEmergencyPage() {
  const [profile, setProfile] = useState<EmergencyProfile | null>(null);
  const [qrs, setQrs] = useState<EmergencyQr[]>([]);
  const [history, setHistory] = useState<AccessHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [activeQr, setActiveQr] = useState<{ selector: string; token: string } | null>(null);

  async function handleDownloadEmergencyPdf() {
    setDownloadingPdf(true);
    try {
      const res = await fetchWithAuth("/emergency/export/pdf");
      if (!res.ok) throw new Error("Failed to generate emergency card PDF");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `healthvault-emergency-card-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to download emergency PDF");
    } finally {
      setDownloadingPdf(false);
    }
  }

  // Form states
  const [bloodGroup, setBloodGroup] = useState("O+");
  const [allergiesText, setAllergiesText] = useState("");
  const [medsText, setMedsText] = useState("");
  const [conditionsText, setConditionsText] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactRelation, setContactRelation] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    loadEmergencyData();
  }, []);

  async function loadEmergencyData() {
    setLoading(true);
    try {
      const [profRes, qrsRes, histRes] = await Promise.all([
        fetchWithAuth("/emergency/profile"),
        fetchWithAuth("/emergency/qr"),
        fetchWithAuth("/emergency/history")
      ]);

      if (profRes.ok) {
        const profData = await profRes.json();
        setProfile(profData);
        setBloodGroup(profData.bloodGroup || "O+");
        setAllergiesText((profData.allergies || []).join(", "));
        setMedsText((profData.emergencyMedications || []).join(", "));
        setConditionsText((profData.criticalConditions || []).join(", "));
        if (profData.emergencyContact) {
          setContactName(profData.emergencyContact.name || "");
          setContactRelation(profData.emergencyContact.relationship || "");
          setContactPhone(profData.emergencyContact.phone || "");
        }
        setIsActive(profData.isActive ?? true);
      }

      if (qrsRes.ok) {
        const qrsData = await qrsRes.json();
        setQrs(qrsData);
      }

      if (histRes.ok) {
        const histData = await histRes.json();
        setHistory(histData);
      }
    } catch (err) {
      console.error("Failed to load emergency data", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        bloodGroup,
        allergies: allergiesText.split(",").map(s => s.trim()).filter(Boolean),
        emergencyMedications: medsText.split(",").map(s => s.trim()).filter(Boolean),
        criticalConditions: conditionsText.split(",").map(s => s.trim()).filter(Boolean),
        emergencyContact: contactName ? {
          name: contactName,
          relationship: contactRelation,
          phone: contactPhone
        } : null,
        isActive
      };

      const res = await fetchWithAuth("/emergency/profile", {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      const updated = await res.json();
      if (!res.ok) throw new Error(updated.error || "Failed to update emergency profile");

      setProfile(updated);
      alert("Emergency Profile updated successfully!");
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Error handling
    } catch (err: any) {
      alert(err.message || "Failed to update emergency profile");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateQr() {
    try {
      const res = await fetchWithAuth("/emergency/qr", {
        method: "POST",
        body: JSON.stringify({
          durationHours: 48,
          maxUses: 10
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate emergency QR");

      setActiveQr(data);
      const qrsRes = await fetchWithAuth("/emergency/qr");
      if (qrsRes.ok) {
        setQrs(await qrsRes.json());
      }
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Error handling
    } catch (err: any) {
      alert(err.message || "Failed to generate emergency QR");
    }
  }

  async function handleRevokeQr(selector: string) {
    if (!confirm("Are you sure you want to revoke this emergency access token?")) return;
    try {
      const res = await fetchWithAuth(`/emergency/qr/${selector}`, {
        method: "DELETE"
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to revoke token");
      }
      if (activeQr?.selector === selector) setActiveQr(null);
      const qrsRes = await fetchWithAuth("/emergency/qr");
      if (qrsRes.ok) {
        setQrs(await qrsRes.json());
      }
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Error handling
    } catch (err: any) {
      alert(err.message || "Failed to revoke token");
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading emergency profile...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldAlert className="w-7 h-7 text-red-600" />
            Emergency Medical Profile & Access Control
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Configure life-saving critical medical data and manage emergency break-glass QR access.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleDownloadEmergencyPdf}
            disabled={downloadingPdf}
            className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm text-sm transition"
          >
            <Download className="w-4 h-4 text-slate-500" />
            {downloadingPdf ? "Generating PDF..." : "Download Emergency Card (PDF)"}
          </button>
          <button
            onClick={handleGenerateQr}
            className="bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-lg flex items-center gap-2 shadow text-sm transition"
          >
            <QrCode className="w-4 h-4" />
            Generate Emergency Access QR
          </button>
        </div>
      </div>

      {/* Active Generated QR Modal / Card */}
      {activeQr && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-6 flex flex-col md:flex-row items-center gap-6 shadow-md">
          <div className="bg-white p-4 rounded-xl shadow-inner border border-red-100">
            <QRCodeDisplay
              selector={activeQr.selector}
              token={activeQr.token}
            />
          </div>
          <div className="space-y-3 flex-1">
            <span className="inline-block px-3 py-1 bg-red-600 text-white font-semibold text-xs rounded-full">
              ACTIVE EMERGENCY QR CODE
            </span>
            <h3 className="text-lg font-bold text-slate-900">Emergency Access Token Ready</h3>
            <p className="text-sm text-slate-700">
              Emergency responders or doctors can scan this QR code to view your critical allergies, conditions, and contacts.
            </p>
            <div className="text-xs text-slate-500 font-mono bg-white p-2 rounded border">
              Selector: {activeQr.selector}
            </div>
            <button
              onClick={() => handleRevokeQr(activeQr.selector)}
              className="text-xs bg-white text-red-600 border border-red-300 hover:bg-red-100 font-medium px-3 py-1.5 rounded"
            >
              Revoke QR Access
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form Column */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <HeartPulse className="w-5 h-5 text-red-500" />
            Critical Health Information
          </h2>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Blood Group</label>
                <select
                  value={bloodGroup}
                  onChange={(e) => setBloodGroup(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                >
                  {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(bg => (
                    <option key={bg} value={bg}>{bg}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Profile Status</label>
                <select
                  value={isActive ? "active" : "inactive"}
                  onChange={(e) => setIsActive(e.target.value === "active")}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                >
                  <option value="active">ACTIVE (Emergency Access Allowed)</option>
                  <option value="inactive">INACTIVE (Emergency Access Disabled)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Known Allergies (Comma separated)</label>
              <input
                type="text"
                placeholder="e.g. Penicillin, Peanuts, Sulfa"
                value={allergiesText}
                onChange={(e) => setAllergiesText(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Emergency Medications (Comma separated)</label>
              <input
                type="text"
                placeholder="e.g. EpiPen 0.3mg, Insulin, Nitroglycerin"
                value={medsText}
                onChange={(e) => setMedsText(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Critical Conditions (Comma separated)</label>
              <input
                type="text"
                placeholder="e.g. Severe Asthma, Type 1 Diabetes, Pacemaker"
                value={conditionsText}
                onChange={(e) => setConditionsText(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
              />
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-bold text-slate-800 mb-3">Emergency Contact Person</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Full Name"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="border border-slate-300 rounded-lg p-2 text-sm"
                />
                <input
                  type="text"
                  placeholder="Relationship (Spouse/Parent)"
                  value={contactRelation}
                  onChange={(e) => setContactRelation(e.target.value)}
                  className="border border-slate-300 rounded-lg p-2 text-sm"
                />
                <input
                  type="text"
                  placeholder="Phone Number"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="border border-slate-300 rounded-lg p-2 text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 rounded-lg text-sm transition"
            >
              {saving ? "Saving Changes..." : "Save Emergency Profile"}
            </button>
          </form>
        </div>

        {/* Tokens & History Sidebar */}
        <div className="space-y-6">
          {/* Active Tokens Card */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center justify-between">
              <span>Active Emergency QRs</span>
              <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-normal">{qrs.length}</span>
            </h3>
            {qrs.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No active emergency QR codes generated.</p>
            ) : (
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {qrs.map((q) => (
                  <div key={q.selector} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs flex items-center justify-between">
                    <div>
                      <div className="font-mono text-slate-700 truncate w-36">{q.selector}</div>
                      <div className="text-slate-500 mt-1">Expires: {new Date(q.expiresAt).toLocaleDateString()}</div>
                    </div>
                    <button
                      onClick={() => handleRevokeQr(q.selector)}
                      className="text-red-600 hover:bg-red-50 p-1.5 rounded"
                      title="Revoke Token"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Access Audit History Card */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-blue-600" />
              Emergency Access Audit History
            </h3>
            {history.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No emergency access events recorded.</p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {history.map((h) => (
                  <div key={h.id} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1">
                    <div className="flex justify-between font-semibold text-slate-800">
                      <span>{h.actorName}</span>
                      <span className="text-slate-500 font-normal">{new Date(h.accessedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {h.doctorSpecialty && <div className="text-blue-600 text-3xs">{h.doctorSpecialty}</div>}
                    <div className="text-slate-600 bg-white p-1.5 rounded border border-slate-100 font-mono text-3xs">
                      Reason: "{h.reason}"
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
