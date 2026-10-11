"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAuth } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { QRCodeDisplay } from "@/components/ui/QRCodeDisplay";
import { Check, ChevronLeft, QrCode, UserCheck, Copy, Clock, Share2, Sparkles } from "lucide-react";
import Link from "next/link";

interface Provider {
  id: string;
  name: string;
  specialty: string;
  organization: string;
}

const CATEGORIES = [
  "CONSULTATION",
  "PRESCRIPTION",
  "LAB_REPORT",
  "IMAGING",
  "DISCHARGE_SUMMARY",
  "VACCINATION",
  "OTHER"
];

const PURPOSES = [
  "Medical consultation",
  "Second opinion",
  "Emergency care",
  "Diagnostic review",
  "Specialist referral"
];

const DURATIONS = [
  { label: "15 minutes", value: 15 },
  { label: "30 minutes", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "4 hours", value: 240 },
  { label: "24 hours", value: 1440 },
];

export default function NewSharePage() {
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Next.js / React temporary strictness disable
  const router = useRouter();

  // Mode: "instant" (1-click QR, no doctor or record selection needed) vs "provider" (Doctor-specific workflow)
  const [shareMode, setShareMode] = useState<"instant" | "provider">("instant");

  // Instant QR State
  const [instantLoading, setInstantLoading] = useState(false);
  const [instantShare, setInstantShare] = useState<{
    id: string;
    rawToken: string;
    shareUrl: string;
    expiresAt: string;
    recordCount: number;
    selector: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Provider Workflow State
  const [step, setStep] = useState(1);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State for Provider Workflow
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedPurpose, setSelectedPurpose] = useState<string>(PURPOSES[0]);
  const [selectedDuration, setSelectedDuration] = useState<number>(60);

  // Result State for Provider Workflow
  const [qrPayload, setQrPayload] = useState<{ selector: string; token: string } | null>(null);

  useEffect(() => {
    // Check URL search parameters on mount
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("mode") === "provider") {
        setShareMode("provider");
      }
    }

    // Load mock providers for doctor workflow
    const loadProviders = async () => {
      try {
        const res = await fetchWithAuth("/patient/providers/fixtures");
        if (res.ok) {
          const data = await res.json();
          setProviders(data);
        }
      } catch (err) {
        console.error("Failed to load providers", err);
      }
    };
    loadProviders();
  }, []);

  const handleGenerateInstantQr = async () => {
    setInstantLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/patient/report-shares", {
        method: "POST",
        body: JSON.stringify({
          title: "Instant HealthVault QR Share",
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to generate instant QR code");
      }

      const data = await res.json();
      setInstantShare(data);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Next.js / React temporary strictness disable
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred while generating QR code");
    } finally {
      setInstantLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!instantShare || typeof window === "undefined") return;
    const fullUrl = `${window.location.origin}${instantShare.shareUrl}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const toggleCategory = (cat: string) => {
    if (selectedCategories.includes(cat)) {
      setSelectedCategories(selectedCategories.filter(c => c !== cat));
    } else {
      setSelectedCategories([...selectedCategories, cat]);
    }
  };

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/patient/sharing", {
        method: "POST",
        body: JSON.stringify({
          granteeUserId: selectedProvider,
          purpose: selectedPurpose,
          categories: selectedCategories,
          durationMinutes: selectedDuration
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to create sharing session");
      }

      const data = await res.json();
      setQrPayload(data.qrPayload);
      setStep(5); // The QR step
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Next.js / React temporary strictness disable
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href="/sharing" className="inline-flex items-center text-sm font-medium text-teal-600 hover:text-teal-700">
          <ChevronLeft size={16} className="mr-1" />
          Back to Shares
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Share your health records</h1>
        <p className="text-slate-500 mt-1">
          Choose between an instant shareable QR code or specific provider access.
        </p>
      </div>

      {/* Mode Selector Tabs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <button
          type="button"
          onClick={() => {
            setShareMode("instant");
            setError(null);
          }}
          className={`p-4 rounded-xl border text-left transition-all ${
            shareMode === "instant"
              ? "border-teal-600 bg-teal-50/70 shadow-xs ring-2 ring-teal-500/20"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${shareMode === "instant" ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600"}`}>
              <QrCode size={20} />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Instant QR Code</p>
              <p className="text-xs text-slate-500 mt-0.5">Share with anyone without selecting a doctor</p>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setShareMode("provider");
            setError(null);
          }}
          className={`p-4 rounded-xl border text-left transition-all ${
            shareMode === "provider"
              ? "border-teal-600 bg-teal-50/70 shadow-xs ring-2 ring-teal-500/20"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${shareMode === "provider" ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600"}`}>
              <UserCheck size={20} />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Select Doctor / Provider</p>
              <p className="text-xs text-slate-500 mt-0.5">Choose registered provider (Dr. Alice Smith, Dr. Bob Jones)</p>
            </div>
          </div>
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Mode 1: Instant QR Code (No Doctor Selection, Shareable) */}
      {shareMode === "instant" && (
        <Card className="border-teal-100">
          <CardContent className="p-6">
            {!instantShare ? (
              <div className="space-y-6">
                <div className="border border-teal-200 bg-teal-50/40 rounded-xl p-5 sm:p-6 space-y-5">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 mb-1">Instant Shareable QR Code</h2>
                    <p className="text-sm text-slate-600">
                      Creates a 24-hour secure QR code and direct link to share your health records.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700">
                    <div className="bg-white p-3 rounded-lg border border-teal-100 shadow-2xs flex items-center gap-2">
                      <Clock size={16} className="text-teal-600 shrink-0" />
                      <span><strong>24-Hour Expiration:</strong> Automatically deactivates after 24 hours</span>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-teal-100 shadow-2xs flex items-center gap-2">
                      <Check size={16} className="text-teal-600 shrink-0" />
                      <span><strong>Revoke Anytime:</strong> Cancel link immediately from Shares page</span>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      variant="primary"
                      onClick={handleGenerateInstantQr}
                      disabled={instantLoading}
                      className="gap-2 px-6 py-2.5 font-semibold text-sm shadow-sm"
                    >
                      <QrCode size={18} />
                      {instantLoading ? "Generating..." : "Generate QR Code Now"}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-teal-100 mb-3 text-teal-700">
                    <Check size={24} />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">Your Shareable QR Code is Ready!</h2>
                  <p className="text-slate-500 text-sm mt-1 max-w-md mx-auto">
                    Anyone who scans this QR code using their smartphone camera and signs in will be able to view your shared health records.
                  </p>
                </div>

                <div className="py-2">
                  <QRCodeDisplay
                    value={typeof window !== "undefined" ? `${window.location.origin}${instantShare.shareUrl}` : instantShare.shareUrl}
                    subtitle="Scan with any smartphone camera to open HealthVault records"
                    expiresInMinutes={1440}
                  />
                </div>

                {/* Direct Link and Copy */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Direct Sharing Link</span>
                    <span className="text-xs text-teal-700 font-medium">Valid for 24 Hours</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={typeof window !== "undefined" ? `${window.location.origin}${instantShare.shareUrl}` : instantShare.shareUrl}
                      className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-700 select-all"
                    />
                    <Button variant="outline" onClick={handleCopyLink} className="gap-1.5 shrink-0 text-xs">
                      {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                      {copied ? "Copied!" : "Copy Link"}
                    </Button>
                  </div>

                  <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                    <span>{instantShare.recordCount} record(s) currently linked to this share</span>
                    <a
                      href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                        `Here is my HealthVault medical report sharing link (valid for 24 hours): ${
                          typeof window !== "undefined" ? window.location.origin : ""
                        }${instantShare.shareUrl}`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-teal-700 hover:text-teal-800 font-medium flex items-center gap-1"
                    >
                      <Share2 size={13} /> Share via WhatsApp
                    </a>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setInstantShare(null)}
                    className="text-xs text-slate-600"
                  >
                    Generate Another QR
                  </Button>
                  <Link href="/sharing">
                    <Button variant="primary" className="text-xs">
                      Done / View All Shares
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Mode 2: Specific Doctor / Provider Workflow (Preserved 100% for future clinical use) */}
      {shareMode === "provider" && (
        <Card>
          <CardContent className="p-6">
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold border-b pb-2">Step 1: Choose Provider</h2>
              <div className="grid gap-3">
                {providers.map(p => (
                  <div 
                    key={p.id} 
                    onClick={() => setSelectedProvider(p.id)}
                    className={`p-4 border rounded-lg cursor-pointer flex justify-between items-center transition-colors ${selectedProvider === p.id ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div>
                      <p className="font-medium text-slate-900">{p.name}</p>
                      <p className="text-sm text-slate-500">{p.specialty} • {p.organization}</p>
                    </div>
                    {selectedProvider === p.id && <Check className="text-teal-600" size={20} />}
                  </div>
                ))}
              </div>
              <div className="flex justify-end pt-4">
                <Button onClick={() => setStep(2)} disabled={!selectedProvider}>Next Step</Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold border-b pb-2">Step 2: Choose Records</h2>
              <p className="text-sm text-slate-600 mb-2">Select the categories of records you wish to share.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CATEGORIES.map(cat => (
                  <label key={cat} className="flex items-center p-4 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                    <input 
                      type="checkbox" 
                      className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-slate-300 rounded"
                      checked={selectedCategories.includes(cat)}
                      onChange={() => toggleCategory(cat)}
                    />
                    <span className="ml-3 text-sm font-medium text-slate-900 capitalize">
                      {cat.replace("_", " ")}
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={() => setStep(3)} disabled={selectedCategories.length === 0}>Next Step</Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold border-b pb-2">Step 3: Purpose & Duration</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Purpose of sharing</label>
                  <select 
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    value={selectedPurpose}
                    onChange={(e) => setSelectedPurpose(e.target.value)}
                  >
                    {PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">How long should access last?</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {DURATIONS.map(d => (
                      <div 
                        key={d.value}
                        onClick={() => setSelectedDuration(d.value)}
                        className={`p-3 border rounded-lg cursor-pointer text-center text-sm font-medium transition-colors ${selectedDuration === d.value ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-700 hover:border-slate-300'}`}
                      >
                        {d.label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                <Button onClick={() => setStep(4)}>Review & Create</Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold border-b pb-2">Step 4: Review</h2>
              
              <div className="bg-slate-50 p-5 rounded-lg space-y-4">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Provider</p>
                  <p className="text-slate-900 font-medium">
                    {providers.find(p => p.id === selectedProvider)?.name}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Categories</p>
                  <p className="text-slate-900 font-medium">
                    {selectedCategories.map(c => c.replace("_", " ")).join(", ")}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Purpose</p>
                  <p className="text-slate-900 font-medium">{selectedPurpose}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Duration</p>
                  <p className="text-slate-900 font-medium">
                    {DURATIONS.find(d => d.value === selectedDuration)?.label}
                  </p>
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep(3)} disabled={loading}>Back</Button>
                <Button variant="primary" onClick={handleCreate} disabled={loading}>
                  {loading ? "Creating..." : "Create Secure Share"}
                </Button>
              </div>
            </div>
          )}

          {step === 5 && qrPayload && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-4">
                  <Check className="text-green-600" size={24} />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Sharing Session Created</h2>
                <p className="text-slate-500 mt-1 max-w-sm mx-auto">
                  Show this QR code to the provider. Do not close this screen until they have scanned it.
                </p>
              </div>

              <div className="py-4">
                <QRCodeDisplay 
                  selector={qrPayload.selector} 
                  token={qrPayload.token} 
                  expiresInMinutes={selectedDuration}
                />
              </div>

              <div className="flex justify-center pt-4">
                <Link href="/sharing">
                  <Button variant="outline">Done</Button>
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}
