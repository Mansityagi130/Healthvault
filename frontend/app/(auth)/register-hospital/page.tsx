"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { API_URL } from "../../../lib/api-client";

export default function RegisterHospitalPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    hfrFacilityId: "",
    licenseNumber: "",
    contactEmail: "",
    contactPhone: "",
    street: "",
    city: "",
    state: "",
    country: "India",
    adminEmail: "",
    adminFirstName: "",
    adminLastName: "",
    adminPassword: ""
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{ name: string; code: string } | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        name: formData.name,
        code: formData.code || undefined,
        hfrFacilityId: formData.hfrFacilityId || undefined,
        licenseNumber: formData.licenseNumber || undefined,
        contactEmail: formData.contactEmail,
        contactPhone: formData.contactPhone || undefined,
        address: {
          street: formData.street,
          city: formData.city,
          state: formData.state,
          country: formData.country
        },
        adminEmail: formData.adminEmail,
        adminFirstName: formData.adminFirstName,
        adminLastName: formData.adminLastName,
        adminPassword: formData.adminPassword || undefined
      };

      const res = await fetch(`${API_URL}/hospitals/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok) {
        setSuccessData({
          name: data.hospital.name,
          code: data.hospital.code
        });
      } else {
        setError(data.error || "Failed to submit hospital application");
      }
    } catch {
      setError("Network error submitting application");
    } finally {
      setLoading(false);
    }
  };

  if (successData) {
    return (
      <div className="space-y-6 text-center py-4">
        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <h3 className="text-2xl font-bold text-slate-900">Application Submitted!</h3>
        <p className="text-sm text-slate-600">
          Your hospital registration application for <strong className="text-slate-900">{successData.name}</strong> ({successData.code}) has been submitted for review.
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs text-amber-800 text-left">
          <strong>Verification Notice:</strong> HealthVault Platform Admin will inspect your submitted details and registration credentials. Upon approval, your hospital status will transition to <strong>VERIFIED</strong>.
        </div>
        <div className="pt-4 space-y-2">
          <button
            onClick={() => router.push("/login")}
            className="w-full py-2.5 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-2 text-slate-600 mb-2">
        <Link href="/login" className="text-sm flex items-center hover:text-slate-900">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Login
        </Link>
      </div>

      <div className="border-b border-slate-200 pb-4">
        <h3 className="text-xl font-bold text-slate-900 flex items-center">
          <Building2 className="w-5 h-5 mr-2 text-blue-600" /> Register New Hospital
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Submit your healthcare organization details for HealthVault Platform Admin verification.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center">
          <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 text-left">
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
            Hospital Name *
          </label>
          <input
            type="text"
            name="name"
            required
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g. Metro Specialty Hospital"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              HFR Facility ID (Optional)
            </label>
            <input
              type="text"
              name="hfrFacilityId"
              value={formData.hfrFacilityId}
              onChange={handleChange}
              placeholder="e.g. IN12345678"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              License Number (Optional)
            </label>
            <input
              type="text"
              name="licenseNumber"
              value={formData.licenseNumber}
              onChange={handleChange}
              placeholder="e.g. MED-LIC-2026-99"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Contact Email *
            </label>
            <input
              type="email"
              name="contactEmail"
              required
              value={formData.contactEmail}
              onChange={handleChange}
              placeholder="contact@hospital.com"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Contact Phone
            </label>
            <input
              type="tel"
              name="contactPhone"
              value={formData.contactPhone}
              onChange={handleChange}
              placeholder="+919876543210"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="pt-2 border-t border-slate-200">
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
            Hospital Admin Account Setup
          </h4>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Admin Email Address *
              </label>
              <input
                type="email"
                name="adminEmail"
                required
                value={formData.adminEmail}
                onChange={handleChange}
                placeholder="admin@hospital.com"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Admin Password *
              </label>
              <input
                type="password"
                name="adminPassword"
                required
                value={formData.adminPassword}
                onChange={handleChange}
                placeholder="••••••••••••"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>
        </div>

        <div className="pt-4">
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition disabled:opacity-50"
          >
            {loading ? "Submitting Application..." : "Submit Hospital Registration"}
          </button>
        </div>
      </form>
    </div>
  );
}
