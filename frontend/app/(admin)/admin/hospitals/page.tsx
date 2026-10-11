"use client";

import { useEffect, useState } from "react";
import { 
  Building2, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  RefreshCw, 
  ShieldCheck, 
  FileText, 
  Clock, 
  Ban, 
  RotateCcw,
  Loader2
} from "lucide-react";
import { fetchWithAuth } from "../../../../lib/api-client";

interface Hospital {
  id: string;
  publicId: string;
  hospitalIdDisplay: string | null;
  name: string;
  code: string;
  hfrFacilityId: string | null;
  licenseNumber: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  verificationStatus: "DRAFT" | "PENDING_REVIEW" | "VERIFIED" | "REJECTED";
  rejectionReason: string | null;
  suspendedReason: string | null;
  createdAt: string;
  verifiedAt: string | null;
}

export default function AdminHospitalsReviewPage() {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [activeTab, setActiveTab] = useState<"PENDING_REVIEW" | "VERIFIED" | "SUSPENDED" | "ALL">("PENDING_REVIEW");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null);
  const [actionType, setActionType] = useState<"VERIFY" | "REJECT" | "SUSPEND" | "RESTORE" | null>(null);
  const [reasonInput, setReasonInput] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);

  const loadHospitals = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/admin/hospitals");
      if (res.ok) {
        const data = await res.json();
        setHospitals(data);
      } else {
        const errData = await res.json();
        setError(errData.error || "Failed to fetch hospital applications");
      }
    } catch {
      setError("Network error fetching hospital applications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHospitals();
  }, []);

  const handleExecuteAction = async () => {
    if (!selectedHospital || !actionType) return;
    setSubmittingAction(true);

    let endpoint = "";
    let body: any = {};

    if (actionType === "VERIFY") {
      endpoint = `/admin/hospitals/${selectedHospital.id}/verify`;
    } else if (actionType === "REJECT") {
      endpoint = `/admin/hospitals/${selectedHospital.id}/reject`;
      body = { rejectionReason: reasonInput };
    } else if (actionType === "SUSPEND") {
      endpoint = `/admin/hospitals/${selectedHospital.id}/suspend`;
      body = { suspendedReason: reasonInput };
    } else if (actionType === "RESTORE") {
      endpoint = `/admin/hospitals/${selectedHospital.id}/restore`;
    }

    try {
      const res = await fetchWithAuth(endpoint, {
        method: "POST",
        body: JSON.stringify(body)
      });

      if (res.ok) {
        setSelectedHospital(null);
        setActionType(null);
        setReasonInput("");
        await loadHospitals();
      } else {
        const errData = await res.json();
        alert(errData.error || "Action failed");
      }
    } catch {
      alert("Network error executing action");
    } finally {
      setSubmittingAction(false);
    }
  };

  const filteredHospitals = hospitals.filter(h => {
    if (activeTab === "PENDING_REVIEW") return h.verificationStatus === "PENDING_REVIEW" || h.verificationStatus === "DRAFT";
    if (activeTab === "VERIFIED") return h.verificationStatus === "VERIFIED" && h.status === "ACTIVE";
    if (activeTab === "SUSPENDED") return h.status === "SUSPENDED";
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center">
            <Building2 className="w-7 h-7 mr-3 text-rose-600" /> Hospital Verification Review
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Review hospital registrations, inspect HFR/License identifiers, and approve or restrict hospital operations.
          </p>
        </div>
        <button
          onClick={loadHospitals}
          className="flex items-center text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg border border-slate-300"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh List
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm flex items-center">
          <AlertTriangle className="w-5 h-5 mr-3 flex-shrink-0 text-rose-600" />
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab("PENDING_REVIEW")}
          className={`pb-3 px-4 font-semibold text-sm transition border-b-2 flex items-center ${
            activeTab === "PENDING_REVIEW"
              ? "border-rose-600 text-rose-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Clock className="w-4 h-4 mr-2" /> Pending Applications ({hospitals.filter(h => h.verificationStatus === "PENDING_REVIEW" || h.verificationStatus === "DRAFT").length})
        </button>

        <button
          onClick={() => setActiveTab("VERIFIED")}
          className={`pb-3 px-4 font-semibold text-sm transition border-b-2 flex items-center ${
            activeTab === "VERIFIED"
              ? "border-emerald-600 text-emerald-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <ShieldCheck className="w-4 h-4 mr-2" /> Verified Hospitals ({hospitals.filter(h => h.verificationStatus === "VERIFIED" && h.status === "ACTIVE").length})
        </button>

        <button
          onClick={() => setActiveTab("SUSPENDED")}
          className={`pb-3 px-4 font-semibold text-sm transition border-b-2 flex items-center ${
            activeTab === "SUSPENDED"
              ? "border-amber-600 text-amber-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Ban className="w-4 h-4 mr-2" /> Suspended Hospitals ({hospitals.filter(h => h.status === "SUSPENDED").length})
        </button>

        <button
          onClick={() => setActiveTab("ALL")}
          className={`pb-3 px-4 font-semibold text-sm transition border-b-2 flex items-center ${
            activeTab === "ALL"
              ? "border-slate-800 text-slate-800"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          All Applications ({hospitals.length})
        </button>
      </div>

      {/* Table List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-slate-500 flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 text-rose-600 animate-spin mb-2" />
            <p className="text-sm">Fetching hospital application records...</p>
          </div>
        ) : filteredHospitals.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="font-medium text-slate-700">No hospital applications found in this category.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 uppercase text-[11px] font-bold tracking-wider border-b border-slate-200">
                  <th className="py-3 px-4">Hospital Details</th>
                  <th className="py-3 px-4">Public Hospital ID</th>
                  <th className="py-3 px-4">HFR Facility ID</th>
                  <th className="py-3 px-4">License Number</th>
                  <th className="py-3 px-4">Verification Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {filteredHospitals.map(h => (
                  <tr key={h.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4 font-medium">
                      <div className="font-bold text-slate-900">{h.name}</div>
                      <div className="text-xs text-slate-500">{h.contactEmail} • {h.code}</div>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-xs">
                      {h.hospitalIdDisplay ? (
                        <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          {h.hospitalIdDisplay}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-sans italic">Not assigned</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-xs font-mono">
                      {h.hfrFacilityId || <span className="text-slate-400 italic">None</span>}
                    </td>

                    <td className="py-3.5 px-4 text-xs">
                      {h.licenseNumber || <span className="text-slate-400 italic">None</span>}
                    </td>

                    <td className="py-3.5 px-4">
                      {h.status === "SUSPENDED" ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                          SUSPENDED
                        </span>
                      ) : h.verificationStatus === "VERIFIED" ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> VERIFIED
                        </span>
                      ) : h.verificationStatus === "REJECTED" ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          REJECTED
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          <Clock className="w-3 h-3 mr-1" /> PENDING REVIEW
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right space-x-2">
                      {h.verificationStatus !== "VERIFIED" && h.status !== "SUSPENDED" && (
                        <button
                          onClick={() => { setSelectedHospital(h); setActionType("VERIFY"); }}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg shadow-sm"
                        >
                          Approve Verification
                        </button>
                      )}

                      {h.verificationStatus === "PENDING_REVIEW" && (
                        <button
                          onClick={() => { setSelectedHospital(h); setActionType("REJECT"); }}
                          className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 font-semibold text-xs rounded-lg border border-rose-300"
                        >
                          Reject
                        </button>
                      )}

                      {h.status === "ACTIVE" && h.verificationStatus === "VERIFIED" && (
                        <button
                          onClick={() => { setSelectedHospital(h); setActionType("SUSPEND"); }}
                          className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold text-xs rounded-lg border border-amber-300"
                        >
                          Suspend
                        </button>
                      )}

                      {h.status === "SUSPENDED" && (
                        <button
                          onClick={() => { setSelectedHospital(h); setActionType("RESTORE"); }}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-sm"
                        >
                          Restore Access
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {selectedHospital && actionType && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 border-b pb-2">
              {actionType === "VERIFY" && "Confirm Hospital Verification"}
              {actionType === "REJECT" && "Reject Hospital Application"}
              {actionType === "SUSPEND" && "Suspend Hospital Operations"}
              {actionType === "RESTORE" && "Restore Hospital Access"}
            </h3>

            <p className="text-sm text-slate-600">
              Target Organization: <strong className="text-slate-900">{selectedHospital.name}</strong> ({selectedHospital.code})
            </p>

            {actionType === "VERIFY" && (
              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg text-xs text-emerald-800">
                Approving this application will generate a stable public <strong>HV-HOSP-XXXXXX</strong> identifier and activate Hospital Admin workflows.
              </div>
            )}

            {(actionType === "REJECT" || actionType === "SUSPEND") && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Reason for {actionType.toLowerCase()} *
                </label>
                <textarea
                  required
                  rows={3}
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  placeholder={`Enter mandatory ${actionType.toLowerCase()} rationale...`}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-2">
              <button
                onClick={() => { setSelectedHospital(null); setActionType(null); setReasonInput(""); }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteAction}
                disabled={submittingAction || ((actionType === "REJECT" || actionType === "SUSPEND") && !reasonInput.trim())}
                className={`px-4 py-2 text-xs font-semibold text-white rounded-lg shadow-sm disabled:opacity-50 ${
                  actionType === "VERIFY" || actionType === "RESTORE"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {submittingAction ? "Processing..." : `Confirm ${actionType}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
