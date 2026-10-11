"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { UserCheck, CheckCircle2, AlertCircle, Loader2, Stethoscope } from "lucide-react";
import { API_URL } from "../../../lib/api-client";

function AcceptInvitationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [invitationDetails, setInvitationDetails] = useState<{
    email: string;
    role: string;
    hospitalName: string;
    departmentName: string | null;
  } | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    password: "",
    registrationNumber: "",
    specialty: "General Medicine",
    licenseState: ""
  });

  useEffect(() => {
    if (!token) {
      setError("Missing invitation token. Please check your invitation link.");
      setLoading(false);
      return;
    }

    async function verifyToken() {
      try {
        const res = await fetch(`${API_URL}/hospitals/invitations/verify?token=${encodeURIComponent(token!)}`);
        const data = await res.json();
        if (res.ok) {
          setInvitationDetails(data.invitation);
        } else {
          setError(data.error || "Invalid or expired invitation token.");
        }
      } catch {
        setError("Network error verifying invitation token.");
      } finally {
        setLoading(false);
      }
    }

    verifyToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/hospitals/invitations/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password: form.password || undefined,
          registrationNumber: form.registrationNumber || undefined,
          specialty: form.specialty || undefined,
          licenseState: form.licenseState || undefined
        })
      });

      const data = await res.json();
      if (res.ok) {
        setSuccess(true);
      } else {
        setError(data.error || "Failed to accept invitation");
      }
    } catch {
      setError("Network error accepting invitation");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-8 text-center flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
        <p className="text-sm text-slate-500">Validating hospital invitation...</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="py-6 text-center space-y-4">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <h3 className="text-2xl font-bold text-slate-900">Invitation Accepted!</h3>
        <p className="text-sm text-slate-600">
          Your hospital membership for <strong className="text-slate-900">{invitationDetails?.hospitalName}</strong> is now active.
        </p>
        <button
          onClick={() => router.push("/login")}
          className="w-full py-2.5 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 mt-4"
        >
          Sign In to Access Dashboard
        </button>
      </div>
    );
  }

  if (error && !invitationDetails) {
    return (
      <div className="py-6 text-center space-y-4">
        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="w-10 h-10" />
        </div>
        <h3 className="text-xl font-bold text-slate-900">Invitation Invalid</h3>
        <p className="text-sm text-rose-600 bg-rose-50 p-3 rounded-lg border border-rose-200">{error}</p>
        <button
          onClick={() => router.push("/login")}
          className="w-full py-2.5 px-4 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200"
        >
          Return to Login
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left">
      <div className="border-b border-slate-200 pb-4 text-center">
        <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-2">
          <Stethoscope className="w-6 h-6" />
        </div>
        <h3 className="text-xl font-bold text-slate-900">Hospital Invitation</h3>
        <p className="text-xs text-slate-600 mt-1">
          You have been invited to join <strong className="text-slate-900">{invitationDetails?.hospitalName}</strong> as a <strong>{invitationDetails?.role}</strong>.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center">
          <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Email Address
          </label>
          <input
            type="text"
            disabled
            value={invitationDetails?.email}
            className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg text-sm text-slate-600"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            Account Password *
          </label>
          <input
            type="password"
            required
            placeholder="••••••••••••"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-slate-400 mt-1">Enter your password to sign in or set a new password if creating an account.</p>
        </div>

        {invitationDetails?.role === "DOCTOR" && (
          <>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Medical Council Registration Number (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. MCI-2026-8899"
                value={form.registrationNumber}
                onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Specialty
                </label>
                <input
                  type="text"
                  placeholder="e.g. Cardiology"
                  value={form.specialty}
                  onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  License State
                </label>
                <input
                  type="text"
                  placeholder="e.g. Maharashtra"
                  value={form.licenseState}
                  onChange={(e) => setForm({ ...form, licenseState: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>
          </>
        )}

        <div className="pt-3">
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition flex justify-center items-center disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserCheck className="w-4 h-4 mr-2" />}
            Accept Invitation & Join Hospital
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={
      <div className="py-8 text-center flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
        <p className="text-sm text-slate-500">Loading invitation details...</p>
      </div>
    }>
      <AcceptInvitationContent />
    </Suspense>
  );
}
