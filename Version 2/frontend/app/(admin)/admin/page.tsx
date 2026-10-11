"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  Building2, 
  FlaskConical, 
  ShieldCheck, 
  AlertTriangle, 
  Clock, 
  ArrowRight, 
  FileText
} from "lucide-react";
import { fetchWithAuth } from "../../../lib/api-client";

interface Hospital {
  id: string;
  name: string;
  status: string;
  verificationStatus: string;
}

interface Lab {
  id: string;
  name: string;
  verificationStatus: string;
}

export default function PlatformAdminDashboardPage() {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStats() {
      setLoading(true);
      setError(null);
      try {
        const [hospRes, labsRes] = await Promise.all([
          fetchWithAuth("/admin/hospitals"),
          fetchWithAuth("/admin/labs")
        ]);

        if (hospRes.ok) {
          const hospData = await hospRes.json();
          setHospitals(hospData);
        } else if (hospRes.status === 403) {
          setError("Access Denied: Platform Admin credentials required.");
        }

        if (labsRes.ok) {
          const labsData = await labsRes.json();
          setLabs(labsData);
        }
      } catch {
        setError("Failed to load platform administration metrics.");
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, []);

  const pendingHospitals = hospitals.filter(h => h.verificationStatus === "PENDING_REVIEW");
  const verifiedHospitals = hospitals.filter(h => h.verificationStatus === "VERIFIED");
  const verifiedLabs = labs.filter(l => l.verificationStatus === "VERIFIED");

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Platform Oversight Dashboard
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Global governance of registered healthcare facilities, diagnostic laboratories, and compliance audit logs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            System Operational
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-sm p-4 rounded-xl flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Pending Hospitals */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Pending Hospitals</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900">
            {loading ? "..." : pendingHospitals.length}
          </div>
          <p className="text-xs text-slate-500">
            Awaiting credential verification
          </p>
        </div>

        {/* Verified Hospitals */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Verified Hospitals</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900">
            {loading ? "..." : verifiedHospitals.length}
          </div>
          <p className="text-xs text-slate-500">
            Authorized healthcare organizations
          </p>
        </div>

        {/* Diagnostic Labs */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Diagnostic Labs</span>
            <div className="p-2 bg-teal-50 text-teal-600 rounded-lg">
              <FlaskConical className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900">
            {loading ? "..." : labs.length}
          </div>
          <p className="text-xs text-slate-500">
            {verifiedLabs.length} verified & active
          </p>
        </div>

        {/* Platform Compliance */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Platform Governance</span>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900">
            Active
          </div>
          <p className="text-xs text-slate-500">
            Immutable Audit Logging enabled
          </p>
        </div>
      </div>

      {/* Action / Governance Modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Hospital Verification Module */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="h-10 w-10 bg-blue-100 text-blue-700 rounded-lg flex items-center justify-center font-bold">
              <Building2 className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">
              Hospital Organization Review
            </h2>
            <p className="text-sm text-slate-600">
              Review and approve incoming hospital registration applications, inspect HFR IDs and medical licenses, or suspend non-compliant facilities.
            </p>
            {pendingHospitals.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 font-medium flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span>{pendingHospitals.length} hospital application(s) require your review.</span>
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <Link
              href="/admin/hospitals"
              className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-800 transition"
            >
              <span>Manage Hospital Applications</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Security & Audit Log Module */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="h-10 w-10 bg-purple-100 text-purple-700 rounded-lg flex items-center justify-center font-bold">
              <FileText className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">
              Audit Logs & Security Monitoring
            </h2>
            <p className="text-sm text-slate-600">
              HealthVault maintains immutable audit logging for all authentication attempts, record accesses, provider onboarding, and consent lifecycles.
            </p>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-700 space-y-1 font-mono">
              <div>&bull; Break-glass access logs recorded</div>
              <div>&bull; Organization onboarding audited</div>
              <div>&bull; Zero credential leaks enforced</div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <Link
              href="/admin/hospitals"
              className="inline-flex items-center gap-2 text-sm font-semibold text-purple-600 hover:text-purple-800 transition"
            >
              <span>View Organization Status</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
