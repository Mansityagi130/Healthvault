"use client";

import React, { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FolderOpen, FileText, Download, ShieldCheck, RefreshCw, AlertCircle, Lock } from "lucide-react";

interface PatientDocument {
  id: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  scanStatus: string;
  createdAt: string;
  recordId?: string;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<PatientDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/patient/records");
      if (!res.ok) throw new Error("Failed to load documents");
      const records = await res.json();
      
      // Extract documents from records
      const allDocs: PatientDocument[] = [];
      if (Array.isArray(records)) {
        for (const record of records) {
          if (Array.isArray(record.documents)) {
            for (const doc of record.documents) {
              allDocs.push({ ...doc, recordId: record.id });
            }
          }
        }
      }
      setDocuments(allDocs);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to fetch documents");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleDownload = async (docId: string, filename: string) => {
    try {
      const res = await fetchWithAuth(`/patient/documents/${docId}`);
      if (!res.ok) throw new Error("Failed to download document");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Download failed");
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FolderOpen className="w-7 h-7 text-teal-600" />
            Documents Vault
          </h1>
          <p className="text-slate-500 mt-1">
            Centralized repository of all medical attachments, lab results, and scanned reports.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchDocuments} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh Vault
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Medical Attachments & Files</CardTitle>
          <CardDescription>
            Documents are automatically virus scanned and encrypted before storage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="p-8 text-center text-slate-400 animate-pulse">Loading documents...</div>
          ) : error ? (
            <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-100 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              {error}
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <FolderOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600 font-medium">No documents uploaded yet</p>
              <p className="text-slate-400 text-sm mt-1">
                Attach files when creating a new record in &quot;My Records&quot; to see them stored securely here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {documents.map((doc) => (
                <div key={doc.id} className="py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2.5 bg-slate-100 text-slate-600 rounded-lg shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-semibold text-slate-900 truncate">{doc.originalFilename}</h4>
                      <p className="text-xs text-slate-500">
                        {formatFileSize(doc.fileSizeBytes)} • Uploaded {new Date(doc.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {doc.scanStatus === "CLEAN" ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Clean
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                        <Lock className="w-3.5 h-3.5" />
                        Quarantined
                      </span>
                    )}

                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleDownload(doc.id, doc.originalFilename)}
                      disabled={doc.scanStatus !== "CLEAN"}
                    >
                      <Download className="w-4 h-4 mr-1.5" />
                      Download
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
