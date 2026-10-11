"use client";

import React, { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FlaskConical, ShieldCheck, Key, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";

interface LabAssociation {
  id: string;
  status: string;
  createdAt: string;
  lab?: {
    id: string;
    name: string;
    code: string;
    address?: unknown;
  };
}

export default function LabConnectionsPage() {
  const [associations, setAssociations] = useState<LabAssociation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pairingToken, setPairingToken] = useState<string | null>(null);
  const [pairingExpiresAt, setPairingExpiresAt] = useState<string | null>(null);
  const [generatingToken, setGeneratingToken] = useState(false);

  const fetchAssociations = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/patient/lab-associations");
      if (!res.ok) throw new Error("Failed to fetch lab connections");
      const data = await res.json();
      setAssociations(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to load lab connections");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssociations();
  }, []);

  const handleGenerateToken = async () => {
    setGeneratingToken(true);
    try {
      const res = await fetchWithAuth("/patient/lab-associations/pairing-token", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to generate pairing token");
      const data = await res.json();
      setPairingToken(data.token || data.code || "TOKEN-GENERATED");
      setPairingExpiresAt(data.expiresAt || null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error generating pairing code");
    } finally {
      setGeneratingToken(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <FlaskConical className="w-7 h-7 text-teal-600" />
          Lab Connections & Integration
        </h1>
        <p className="text-slate-500 mt-1">
          Connect with verified diagnostic laboratories to automatically receive lab results directly in your HealthVault.
        </p>
      </div>

      {/* Generate Pairing Token Card */}
      <Card className="border-teal-100 bg-gradient-to-r from-teal-50/50 to-blue-50/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-teal-600 text-white rounded-lg">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-lg text-slate-900">Connect a New Diagnostic Lab</CardTitle>
              <CardDescription>
                Generate a secure one-time pairing code to present to your lab technician.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {pairingToken ? (
            <div className="bg-white p-4 rounded-xl border border-teal-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">Your One-Time Pairing Code</p>
                <p className="text-2xl font-mono font-bold tracking-widest text-teal-700">{pairingToken}</p>
                {pairingExpiresAt && (
                  <p className="text-xs text-slate-500 mt-1">
                    Expires at: {new Date(pairingExpiresAt).toLocaleTimeString()}
                  </p>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={handleGenerateToken} disabled={generatingToken}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Generate New Code
              </Button>
            </div>
          ) : (
            <Button onClick={handleGenerateToken} disabled={generatingToken} variant="primary" className="gap-2">
              <Key className="w-4 h-4" />
              {generatingToken ? "Generating..." : "Generate Lab Pairing Code"}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Connected Labs List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Connected Diagnostic Labs</CardTitle>
            <CardDescription>Laboratories authorized to upload test reports to your vault.</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchAssociations} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="p-8 text-center text-slate-400 animate-pulse">Loading connections...</div>
          ) : error ? (
            <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-100 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              {error}
            </div>
          ) : associations.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <FlaskConical className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600 font-medium">No lab connections yet</p>
              <p className="text-slate-400 text-sm mt-1">
                Generate a pairing code above and share it with your diagnostic center to connect.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {associations.map((assoc) => (
                <div key={assoc.id} className="py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-teal-50 text-teal-600 rounded-full flex items-center justify-center font-bold">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900">{assoc.lab?.name || "Diagnostic Laboratory"}</h4>
                      <p className="text-xs text-slate-500">
                        Code: {assoc.lab?.code || "N/A"} • Connected: {new Date(assoc.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {assoc.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
