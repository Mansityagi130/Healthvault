"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { fetchWithAuth } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { User, Shield, Clock, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface ProfileData {
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  phone?: string;
  sexAtBirth?: string;
  preferredLanguage?: string;
}

export default function ProfileSettingsPage() {
  const [formData, setFormData] = useState<ProfileData>({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    phone: "",
    sexAtBirth: "",
    preferredLanguage: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetchWithAuth("/patient/profile");
        if (res.ok) {
          const profile = await res.json();
          setFormData({
            firstName: profile.firstName || "",
            lastName: profile.lastName || "",
            dateOfBirth: profile.dateOfBirth ? new Date(profile.dateOfBirth).toISOString().split("T")[0] : "",
            phone: profile.phone || "",
            sexAtBirth: profile.sexAtBirth || "",
            preferredLanguage: profile.preferredLanguage || "",
          });
        } else {
          setError("Failed to load profile data.");
        }
      } catch {
        setError("Network error loading profile.");
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess("");
    setError("");

    try {
      const payload: Record<string, string | null> = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
      };

      if (formData.dateOfBirth) {
        payload.dateOfBirth = new Date(formData.dateOfBirth).toISOString();
      }
      if (formData.phone) payload.phone = formData.phone.trim();
      if (formData.sexAtBirth) payload.sexAtBirth = formData.sexAtBirth;
      if (formData.preferredLanguage) payload.preferredLanguage = formData.preferredLanguage.trim();

      const res = await fetchWithAuth("/patient/profile", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to update profile");
      }

      setSuccess("Profile details updated successfully.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-4">
      {/* Settings Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <User className="text-teal-700 w-7 h-7" />
            Account Settings
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Manage your personal profile demographics, security configurations, and audit trail.
          </p>
        </div>
      </div>

      <div className="flex space-x-2 border-b border-slate-200">
        <Link
          href="/settings/profile"
          className="pb-3 px-4 font-semibold text-sm border-b-2 border-teal-600 text-teal-700 flex items-center gap-2"
        >
          <User className="w-4 h-4" /> Personal Profile
        </Link>
        <Link
          href="/settings/security"
          className="pb-3 px-4 font-medium text-sm border-b-2 border-transparent text-slate-500 hover:text-slate-700 flex items-center gap-2"
        >
          <Shield className="w-4 h-4" /> Security & Passwords
        </Link>
        <Link
          href="/settings/security/audit"
          className="pb-3 px-4 font-medium text-sm border-b-2 border-transparent text-slate-500 hover:text-slate-700 flex items-center gap-2"
        >
          <Clock className="w-4 h-4" /> Audit Trail
        </Link>
      </div>

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl text-sm flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Card className="border border-slate-200 shadow-sm">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100">
          <CardTitle className="text-lg font-semibold text-slate-800">
            Demographic Information
          </CardTitle>
          <CardDescription>
            Personal health details displayed on your medical records and patient timeline.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-6">
          {loading ? (
            <div className="py-12 flex items-center justify-center text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin text-teal-600 mr-2" />
              Loading profile details...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-semibold text-slate-700 mb-1.5">
                    First Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={handleChange}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label htmlFor="lastName" className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Last Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={handleChange}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label htmlFor="dateOfBirth" className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Date of Birth
                  </label>
                  <input
                    id="dateOfBirth"
                    name="dateOfBirth"
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={handleChange}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Contact Phone
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="+91 9876543210"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label htmlFor="sexAtBirth" className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Sex at Birth
                  </label>
                  <select
                    id="sexAtBirth"
                    name="sexAtBirth"
                    value={formData.sexAtBirth}
                    onChange={handleChange}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                  >
                    <option value="">Select option</option>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                    <option value="UNKNOWN">Prefer not to say</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="preferredLanguage" className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Preferred Language
                  </label>
                  <input
                    id="preferredLanguage"
                    name="preferredLanguage"
                    type="text"
                    value={formData.preferredLanguage}
                    onChange={handleChange}
                    placeholder="e.g. English, Hindi"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-semibold px-6 py-2.5 rounded-lg shadow-sm"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving changes...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
