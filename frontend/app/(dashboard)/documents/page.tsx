"use client";

import React, { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { 
  FolderOpen, 
  FileText, 
  Download, 
  ShieldCheck, 
  RefreshCw, 
  AlertCircle, 
  Lock, 
  Eye, 
  Printer, 
  X, 
  Search, 
  FileArchive,
  Image as ImageIcon
} from "lucide-react";

interface PatientDocument {
  id: string;
  originalFilename: string;
  mimeType: string;
  byteSize: string | number;
  securityStatus: string;
  createdAt: string;
  medicalRecordId?: string;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<PatientDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");

  // In-App Preview State
  const [previewDoc, setPreviewDoc] = useState<{
    id: string;
    filename: string;
    mimeType: string;
    url: string;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Export state
  const [exportingHistory, setExportingHistory] = useState(false);

  const fetchDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/patient/documents");
      if (!res.ok) throw new Error("Failed to load documents");
      const data = await res.json();
      setDocuments(Array.isArray(data) ? data : []);
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

  const handlePreview = async (doc: PatientDocument) => {
    setPreviewLoading(true);
    try {
      const res = await fetchWithAuth(`/patient/documents/${doc.id}`);
      if (!res.ok) throw new Error("Failed to load document for preview");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      setPreviewDoc({
        id: doc.id,
        filename: doc.originalFilename,
        mimeType: doc.mimeType,
        url,
      });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (previewDoc?.url) {
      window.URL.revokeObjectURL(previewDoc.url);
    }
    setPreviewDoc(null);
  };

  const handlePrint = (url: string) => {
    const printWindow = window.open(url, "_blank");
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

  const handleExportConsolidatedPdf = async () => {
    setExportingHistory(true);
    try {
      const res = await fetchWithAuth("/patient/export/pdf");
      if (!res.ok) throw new Error("Failed to generate consolidated PDF export");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `healthvault-medical-history-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportingHistory(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch = doc.originalFilename.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    if (typeFilter === "PDF") return doc.mimeType === "application/pdf";
    if (typeFilter === "IMAGE") return doc.mimeType.startsWith("image/");
    return true;
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
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
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={handleExportConsolidatedPdf}
            disabled={exportingHistory}
            className="gap-2 bg-teal-600 hover:bg-teal-700"
          >
            <FileArchive className="w-4 h-4" />
            {exportingHistory ? "Generating Export..." : "Export Medical History (PDF)"}
          </Button>
          <Button variant="outline" size="sm" onClick={fetchDocuments} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh Vault
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search documents by filename..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTypeFilter("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              typeFilter === "ALL"
                ? "bg-teal-50 border-teal-500 text-teal-700"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            All Files ({documents.length})
          </button>
          <button
            onClick={() => setTypeFilter("PDF")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              typeFilter === "PDF"
                ? "bg-teal-50 border-teal-500 text-teal-700"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            PDFs
          </button>
          <button
            onClick={() => setTypeFilter("IMAGE")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              typeFilter === "IMAGE"
                ? "bg-teal-50 border-teal-500 text-teal-700"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            Images
          </button>
        </div>
      </div>

      {/* Documents Card */}
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
          ) : filteredDocuments.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <FolderOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-600 font-medium">
                {searchTerm || typeFilter !== "ALL" ? "No matching documents found" : "No documents uploaded yet"}
              </p>
              <p className="text-slate-400 text-sm mt-1">
                {searchTerm || typeFilter !== "ALL"
                  ? "Try clearing your filters or search terms."
                  : 'Attach files when creating a new record in "My Records" to see them stored securely here.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredDocuments.map((doc) => (
                <div key={doc.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2.5 bg-slate-100 text-slate-600 rounded-lg shrink-0">
                      {doc.mimeType.startsWith("image/") ? (
                        <ImageIcon className="w-5 h-5 text-indigo-600" />
                      ) : (
                        <FileText className="w-5 h-5 text-teal-600" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-semibold text-slate-900 truncate">{doc.originalFilename}</h4>
                      <p className="text-xs text-slate-500">
                        {formatFileSize(Number(doc.byteSize || 0))} • Uploaded {new Date(doc.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {doc.securityStatus === "CLEAN" ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Clean
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                        <Lock className="w-3.5 h-3.5" />
                        {doc.securityStatus === "PENDING_SCAN" ? "Scanning..." : "Quarantined"}
                      </span>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePreview(doc)}
                      disabled={doc.securityStatus !== "CLEAN" || previewLoading}
                      title="Preview document in browser"
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      Preview
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownload(doc.id, doc.originalFilename)}
                      disabled={doc.securityStatus !== "CLEAN"}
                      title="Download original file"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* In-App Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full flex flex-col max-h-[90vh] overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="min-w-0 pr-4">
                <h3 className="font-bold text-slate-900 truncate">{previewDoc.filename}</h3>
                <p className="text-xs text-slate-500">{previewDoc.mimeType}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => handlePrint(previewDoc.url)}>
                  <Printer className="w-4 h-4 mr-1" />
                  Print
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleDownload(previewDoc.id, previewDoc.filename)}>
                  <Download className="w-4 h-4 mr-1" />
                  Download
                </Button>
                <button
                  onClick={closePreview}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-4 flex-1 overflow-auto bg-slate-100 flex items-center justify-center min-h-[50vh]">
              {previewDoc.mimeType === "application/pdf" ? (
                <iframe
                  src={previewDoc.url}
                  className="w-full h-[65vh] rounded-lg border border-slate-300 bg-white"
                  title={previewDoc.filename}
                />
              ) : previewDoc.mimeType.startsWith("image/") ? (
                <img
                  src={previewDoc.url}
                  alt={previewDoc.filename}
                  className="max-h-[65vh] max-w-full rounded-lg object-contain shadow-sm bg-white"
                />
              ) : (
                <div className="text-center p-8 bg-white rounded-lg border border-slate-200">
                  <FileText className="w-12 h-12 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-700">Preview not supported for this file type</p>
                  <p className="text-xs text-slate-500 mt-1">Please download the file to view it in an external application.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
