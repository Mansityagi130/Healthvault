"use client";

import React, { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchWithAuth } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  FileText,
  Download,
  ShieldCheck,
  ShieldAlert,
  Clock,
  User,
  AlertCircle,
  Eye,
  X,
  Lock,
  ArrowRight,
  Printer,
  Calendar,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";

interface SharedDocument {
  id: string;
  originalFilename: string;
  mimeType: string;
  byteSize: string;
  securityStatus: string;
  isDownloadable: boolean;
  downloadBlockedReason: string | null;
  uploadedAt: string;
}

interface SharedRecord {
  id: string;
  publicId: string;
  title: string | null;
  category: string;
  occurredAt: string;
  issuedAt: string | null;
  documents: SharedDocument[];
  consultation?: {
    clinicalSummary: any;
    encounterAt: string;
    doctorProfile?: { specialty: string | null; registrationNumber: string };
    hospital?: { name: string };
  } | null;
  prescription?: {
    issuedAt: string;
    instructions: string | null;
    items: Array<{ medicationName: string; dosage: string; frequency: string; duration: string }>;
    doctorProfile?: { specialty: string | null; registrationNumber: string };
  } | null;
  labReport?: {
    testName: string;
    status: string;
    summaryNotes: string | null;
    results: Array<{ testCode: string; testName: string; value: string; unit: string; referenceRange: string; interpretation: string }>;
  } | null;
}

interface SharedReportsData {
  shareId: string;
  title: string | null;
  createdAt: string;
  expiresAt: string;
  isExpired: boolean;
  sharedBy: {
    firstName: string;
    lastName: string;
    patientIdDisplay: string | null;
  };
  records: SharedRecord[];
}

export default function SharedReportsPage({ params }: { params: Promise<{ token: string }> }) {
  const resolvedParams = use(params);
  const token = resolvedParams.token;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SharedReportsData | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  // Countdown timer state
  const [timeLeft, setTimeLeft] = useState<{ hours: number; minutes: number; seconds: number; isExpired: boolean }>({
    hours: 24,
    minutes: 0,
    seconds: 0,
    isExpired: false,
  });

  // In-App Document Preview Modal
  const [previewDoc, setPreviewDoc] = useState<{
    id: string;
    filename: string;
    mimeType: string;
    url: string;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    async function loadSharedReports() {
      setLoading(true);
      setErrorStatus(null);
      setErrorMessage("");

      try {
        const res = await fetchWithAuth(`/shared-reports/${token}`);

        if (res.status === 401) {
          setErrorStatus(401);
          setErrorMessage("Authentication required to view these shared medical records.");
          // Automatically redirect to login with safe redirect
          router.push(`/login?redirect=${encodeURIComponent(`/shared/reports/${token}`)}`);
          return;
        }

        if (res.status === 404) {
          setErrorStatus(404);
          setErrorMessage("This shared report link was not found or is invalid.");
          return;
        }

        if (res.status === 403) {
          setErrorStatus(403);
          setErrorMessage("This shared report link has been revoked by the patient.");
          return;
        }

        if (res.status === 410) {
          setErrorStatus(410);
          setErrorMessage("This shared report link expired after 24 hours.");
          return;
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed to fetch shared reports (${res.status})`);
        }

        const json: SharedReportsData = await res.json();
        setData(json);
      } catch (err: any) {
        setErrorStatus(500);
        setErrorMessage(err.message || "Failed to load shared reports.");
      } finally {
        setLoading(false);
      }
    }

    if (token) {
      loadSharedReports();
    }
  }, [token, router]);

  // Expiration countdown ticker
  useEffect(() => {
    if (!data?.expiresAt) return;

    function updateCountdown() {
      const targetTime = new Date(data!.expiresAt).getTime();
      const diff = targetTime - Date.now();

      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, isExpired: true });
        setErrorStatus(410);
        setErrorMessage("This shared report link expired after 24 hours.");
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft({ hours, minutes, seconds, isExpired: false });
      }
    }

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [data?.expiresAt]);

  // Clean up object URLs
  useEffect(() => {
    return () => {
      if (previewDoc?.url) {
        window.URL.revokeObjectURL(previewDoc.url);
      }
    };
  }, [previewDoc]);

  const handleDownload = async (docId: string, filename: string) => {
    try {
      const res = await fetchWithAuth(`/shared-reports/${token}/documents/${docId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to download document");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || "Download failed");
    }
  };

  const handlePreview = async (doc: SharedDocument) => {
    setPreviewLoading(true);
    try {
      const res = await fetchWithAuth(`/shared-reports/${token}/documents/${doc.id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load document for preview");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      setPreviewDoc({
        id: doc.id,
        filename: doc.originalFilename,
        mimeType: doc.mimeType,
        url,
      });
    } catch (err: any) {
      alert(err.message || "Failed to open preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  const formatBytes = (bytes: string | number) => {
    const b = Number(bytes);
    if (!b || isNaN(b)) return "0 B";
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-sm border border-slate-200 text-center space-y-4">
          <Loader2 className="w-10 h-10 text-teal-600 animate-spin mx-auto" />
          <h2 className="text-xl font-bold text-slate-900">Validating Share Access</h2>
          <p className="text-sm text-slate-500">Checking authentication and 24-hour security window...</p>
        </div>
      </div>
    );
  }

  // 401: Unauthenticated
  if (errorStatus === 401) {
    const loginTarget = `/login?redirect=${encodeURIComponent(`/shared/reports/${token}`)}`;
    const registerTarget = `/register?redirect=${encodeURIComponent(`/shared/reports/${token}`)}`;
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-sm border border-slate-200 text-center space-y-6">
          <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto text-amber-600 border border-amber-200">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Authentication Required</h2>
            <p className="text-sm text-slate-600 mt-2">
              For privacy and patient confidentiality, you must sign in to HealthVault before accessing these QR-shared medical records.
            </p>
          </div>
          <div className="space-y-3 pt-2">
            <Link
              href={loginTarget}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 transition-colors shadow-sm"
            >
              Sign In to View Reports <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href={registerTarget}
              className="w-full flex items-center justify-center py-2.5 px-4 rounded-xl text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              Register New Account
            </Link>
          </div>
          <p className="text-xs text-slate-400">
            You will be redirected straight back to these reports once authenticated.
          </p>
        </div>
      </div>
    );
  }

  // 410: Expired
  if (errorStatus === 410 || timeLeft.isExpired) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-sm border border-slate-200 text-center space-y-6">
          <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto text-rose-600 border border-rose-200">
            <Clock className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Share Link Expired</h2>
            <p className="text-sm text-slate-600 mt-2">
              This shared report link had a strict 24-hour expiration policy and has now expired.
            </p>
          </div>
          <div className="bg-rose-50 p-4 rounded-xl text-xs text-rose-700 border border-rose-200 text-left">
            Please ask the patient to generate a new QR share from their HealthVault Records dashboard.
          </div>
          <Link
            href="/dashboard"
            className="inline-block w-full py-2.5 px-4 rounded-xl text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 transition-colors"
          >
            Go to HealthVault Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // 403: Revoked
  if (errorStatus === 403) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-sm border border-slate-200 text-center space-y-6">
          <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto text-amber-600 border border-amber-200">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Access Revoked</h2>
            <p className="text-sm text-slate-600 mt-2">
              The sharing patient has revoked access to these shared medical records.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-block w-full py-2.5 px-4 rounded-xl text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 transition-colors"
          >
            Go to HealthVault Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Other Errors (404, 500)
  if (errorStatus || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-sm border border-slate-200 text-center space-y-6">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto text-red-600 border border-red-200">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Unable to Open Shared Reports</h2>
            <p className="text-sm text-slate-600 mt-2">{errorMessage || "Invalid or nonexistent share link."}</p>
          </div>
          <Link
            href="/dashboard"
            className="inline-block w-full py-2.5 px-4 rounded-xl text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 transition-colors"
          >
            Go to HealthVault Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Success view
  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header Banner */}
        <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="info" className="gap-1 px-3 py-1 text-xs">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                  Verified Patient-to-Patient Share
                </Badge>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
                {data.title || "Shared Medical Reports"}
              </h1>
              <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
                <User className="w-4 h-4 text-slate-400" />
                Shared by:{" "}
                <span className="font-semibold text-slate-800">
                  {data.sharedBy.firstName} {data.sharedBy.lastName}
                </span>
                {data.sharedBy.patientIdDisplay && (
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                    {data.sharedBy.patientIdDisplay}
                  </span>
                )}
              </p>
            </div>

            {/* 24-Hour Countdown Box */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col items-start sm:items-end min-w-[200px]">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 mb-1 uppercase tracking-wider">
                <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                24-Hour Expiry Window
              </div>
              <div className="text-2xl font-mono font-bold text-amber-900">
                {String(timeLeft.hours).padStart(2, "0")}:{String(timeLeft.minutes).padStart(2, "0")}:{String(timeLeft.seconds).padStart(2, "0")}
              </div>
              <span className="text-xs text-amber-700 mt-0.5">
                Expires at {new Date(data.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          </div>

          <div className="pt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              Shared on: {new Date(data.createdAt).toLocaleDateString()} at{" "}
              {new Date(data.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="font-medium text-teal-700">
              {data.records.length} {data.records.length === 1 ? "Report" : "Reports"} Authorized
            </span>
          </div>
        </div>

        {/* Reports Listing */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 px-1">Authorized Medical Records</h2>

          {data.records.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center text-slate-500 border border-slate-200">
              No specific records available in this share.
            </div>
          ) : (
            data.records.map((record) => (
              <Card key={record.id} className="border-slate-200 shadow-sm overflow-hidden">
                <CardHeader className="bg-slate-50/70 border-b border-slate-100 py-4 px-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="neutral" className="uppercase text-[10px] tracking-wide font-semibold">
                          {record.category}
                        </Badge>
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(record.occurredAt).toLocaleDateString()}
                        </span>
                      </div>
                      <CardTitle className="text-lg text-slate-900 font-bold">
                        {record.title || `${record.category} Record`}
                      </CardTitle>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-6 space-y-6">
                  {/* Clinical Consultation Notes */}
                  {record.consultation && (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-teal-600" />
                        Clinical Consultation Details
                      </h4>
                      {record.consultation.hospital && (
                        <p className="text-xs text-slate-600">
                          Facility: <span className="font-medium text-slate-800">{record.consultation.hospital.name}</span>
                        </p>
                      )}
                      {record.consultation.clinicalSummary && (
                        <div className="text-sm text-slate-700 pt-1">
                          <p className="font-medium text-xs text-slate-500 mb-0.5">Summary / Notes:</p>
                          <pre className="text-xs font-sans whitespace-pre-wrap bg-white p-3 rounded-lg border border-slate-200">
                            {typeof record.consultation.clinicalSummary === "string"
                              ? record.consultation.clinicalSummary
                              : JSON.stringify(record.consultation.clinicalSummary, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Prescription */}
                  {record.prescription && record.prescription.items.length > 0 && (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-teal-600" />
                        Prescribed Medications
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200 text-slate-500">
                              <th className="py-2 pr-4 font-semibold">Medication</th>
                              <th className="py-2 pr-4 font-semibold">Dosage</th>
                              <th className="py-2 pr-4 font-semibold">Frequency</th>
                              <th className="py-2 font-semibold">Duration</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {record.prescription.items.map((item, idx) => (
                              <tr key={idx}>
                                <td className="py-2 pr-4 font-medium text-slate-800">{item.medicationName}</td>
                                <td className="py-2 pr-4 text-slate-600">{item.dosage}</td>
                                <td className="py-2 pr-4 text-slate-600">{item.frequency}</td>
                                <td className="py-2 text-slate-600">{item.duration}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Lab Test Results */}
                  {record.labReport && (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-teal-600" />
                        Laboratory Report: {record.labReport.testName}
                      </h4>
                      {record.labReport.results && record.labReport.results.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-slate-200 text-slate-500">
                                <th className="py-2 pr-4 font-semibold">Test Parameter</th>
                                <th className="py-2 pr-4 font-semibold">Result Value</th>
                                <th className="py-2 pr-4 font-semibold">Unit</th>
                                <th className="py-2 font-semibold">Reference Range</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {record.labReport.results.map((res, idx) => (
                                <tr key={idx}>
                                  <td className="py-2 pr-4 font-medium text-slate-800">{res.testName}</td>
                                  <td className="py-2 pr-4 font-bold text-slate-900">{res.value}</td>
                                  <td className="py-2 pr-4 text-slate-600">{res.unit}</td>
                                  <td className="py-2 text-slate-500">{res.referenceRange}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Attached Documents */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                      Attached Documents & Scans ({record.documents.length})
                    </h4>

                    {record.documents.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No attached files for this record.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {record.documents.map((doc) => (
                          <div
                            key={doc.id}
                            className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between hover:border-slate-300 transition-colors shadow-2xs"
                          >
                            <div className="flex items-start gap-3 mb-3">
                              <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center text-teal-700 shrink-0">
                                <FileText className="w-5 h-5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-slate-900 truncate" title={doc.originalFilename}>
                                  {doc.originalFilename}
                                </p>
                                <p className="text-xs text-slate-400 mt-0.5">
                                  {formatBytes(doc.byteSize)} • {doc.mimeType.split("/")[1]?.toUpperCase() || "FILE"}
                                </p>
                                <div className="mt-1">
                                  {doc.securityStatus === "CLEAN" ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                      Virus Scanned & Clean
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                      Security Quarantine / Scan Pending
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handlePreview(doc)}
                                disabled={previewLoading || !doc.isDownloadable}
                                className="flex-1 text-xs gap-1.5"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Preview
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleDownload(doc.id, doc.originalFilename)}
                                disabled={!doc.isDownloadable}
                                className="flex-1 text-xs gap-1.5 bg-teal-700 hover:bg-teal-800 text-white"
                                title={doc.downloadBlockedReason || "Download file"}
                              >
                                <Download className="w-3.5 h-3.5" />
                                Download
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* In-App Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2 overflow-hidden">
                <FileText className="w-5 h-5 text-teal-600 shrink-0" />
                <h3 className="font-semibold text-slate-800 truncate">{previewDoc.filename}</h3>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.print()}
                  className="gap-1.5 text-xs hidden sm:flex"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleDownload(previewDoc.id, previewDoc.filename)}
                  className="gap-1.5 text-xs bg-teal-700 hover:bg-teal-800 text-white"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </Button>
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors ml-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 p-4 bg-slate-100 overflow-auto flex items-center justify-center min-h-[500px]">
              {previewDoc.mimeType === "application/pdf" ? (
                <iframe
                  src={previewDoc.url}
                  className="w-full h-full min-h-[600px] rounded-lg border border-slate-200 bg-white"
                  title="PDF Preview"
                />
              ) : previewDoc.mimeType.startsWith("image/") ? (
                <div className="max-w-full max-h-[75vh] flex items-center justify-center">
                  <img
                    src={previewDoc.url}
                    alt={previewDoc.filename}
                    className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-sm"
                  />
                </div>
              ) : (
                <div className="text-center p-8 bg-white rounded-xl border border-slate-200 max-w-sm">
                  <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                  <p className="text-sm font-medium text-slate-700">Preview not available for this file type</p>
                  <p className="text-xs text-slate-400 mt-1 mb-4">Please download the file to view its contents.</p>
                  <Button
                    size="sm"
                    onClick={() => handleDownload(previewDoc.id, previewDoc.filename)}
                    className="bg-teal-700 hover:bg-teal-800 text-white text-xs gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download File
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
