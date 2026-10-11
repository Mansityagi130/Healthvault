"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { fetchWithAuth } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { SearchBar } from "@/components/ui/SearchBar";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Next.js / React temporary strictness disable
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { FilterPopover } from "@/components/ui/FilterPopover";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { QRCodeDisplay } from "@/components/ui/QRCodeDisplay";
import { Plus, FileText, Filter, ChevronLeft, ChevronRight, Activity, Calendar, Download, FileArchive, X, QrCode, Copy, Check, Clock, ShieldCheck } from "lucide-react";

interface RecordItem {
  id: string;
  category: string;
  title: string;
  occurredAt: string;
  source: string;
  provenanceStatus: string;
  lifecycleStatus: string;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const CATEGORIES = [
  { value: "", label: "All" },
  { value: "CONSULTATION", label: "Consultations" },
  { value: "PRESCRIPTION", label: "Prescriptions" },
  { value: "LAB_REPORT", label: "Lab Reports" },
  { value: "IMAGING", label: "Imaging" },
  { value: "DISCHARGE_SUMMARY", label: "Discharge Summaries" },
  { value: "VACCINATION", label: "Vaccinations" },
  { value: "OTHER", label: "Other" },
];

const formatCategory = (cat: string) => {
  const match = CATEGORIES.find(c => c.value === cat);
  return match ? match.label : cat;
};

const formatProvenance = (prov: string) => {
  switch (prov) {
    case "PATIENT_UPLOADED": return "Patient uploaded";
    case "PROVIDER_CREATED": return "Healthcare provider";
    case "HOSPITAL_CREATED": return "Hospital";
    case "LAB_VERIFIED": return "Laboratory verified";
    default: return prov;
  }
};

const getStatusVariant = (status: string): "success" | "neutral" | "warning" | "error" => {
  switch (status) {
    case "ACTIVE": return "success";
    case "ARCHIVED": return "neutral";
    case "SUPERSEDED": return "warning";
    case "REVOKED": return "error";
    default: return "neutral";
  }
};

export default function RecordsPage() {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Filters
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  // Export Modal State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportCategory, setExportCategory] = useState("");
  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  // QR Share Modal State (24-Hour Expiry)
  const [showShareQrModal, setShowShareQrModal] = useState(false);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [shareTitle, setShareTitle] = useState("");
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);
  const [generatedShare, setGeneratedShare] = useState<{
    id: string;
    shareUrl: string;
    rawToken: string;
    expiresAt: string;
    selector: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const toggleRecordSelection = (id: string) => {
    setSelectedRecordIds((prev) =>
      prev.includes(id) ? prev.filter((rId) => rId !== id) : [...prev, id]
    );
  };

  const handleGenerateShare = async () => {
    if (selectedRecordIds.length === 0) {
      alert("Please select at least one record to share.");
      return;
    }
    setIsGeneratingShare(true);
    try {
      const res = await fetchWithAuth("/patient/report-shares", {
        method: "POST",
        body: JSON.stringify({
          recordIds: selectedRecordIds,
          title: shareTitle.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate QR share");
      }
      setGeneratedShare(data);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to generate QR share");
    } finally {
      setIsGeneratingShare(false);
    }
  };

  const handleCopyLink = () => {
    if (!generatedShare) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const fullUrl = `${origin}${generatedShare.shareUrl}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const resetShareModal = () => {
    setShowShareQrModal(false);
    setSelectedRecordIds([]);
    setShareTitle("");
    setGeneratedShare(null);
    setCopiedLink(false);
  };

  const handleExportPdf = async () => {
    setIsExporting(true);
    try {
      const payload: Record<string, string> = {};
      if (exportCategory) payload.category = exportCategory;
      if (exportDateFrom) payload.dateFrom = exportDateFrom;
      if (exportDateTo) payload.dateTo = exportDateTo;

      const res = await fetchWithAuth("/patient/export/pdf", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to generate PDF export");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `healthvault-medical-history-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setShowExportModal(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const qs = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      });
      if (category) {
        qs.set("category", category);
      }
      if (search) {
        qs.set("search", search);
      }
      
      const res = await fetchWithAuth(`/patient/records?${qs.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      
      setRecords(data.items || []);
      setPagination(data.pagination || null);
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Next.js / React temporary strictness disable
    } catch (err) {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [category, search, page, pageSize]);

  useEffect(() => {
// eslint-disable-next-line react-hooks/set-state-in-effect -- Next.js / React temporary strictness disable
    loadRecords();
  }, [loadRecords]);

  const handleSearch = (val: string) => {
    setSearch(val);
    setPage(1);
  };

  const handleCategoryChange = (val: string) => {
    setCategory(val);
    setPage(1); // Reset to first page
  };

  const handlePrev = () => {
    if (page > 1) setPage(p => p - 1);
  };
  const handleNext = () => {
    if (pagination && page < pagination.totalPages) setPage(p => p + 1);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Health Records</h1>
          <p className="text-slate-500 mt-1">Your medical history, organized in one secure place.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            className="gap-2 text-teal-700 border-teal-200 hover:bg-teal-50"
            onClick={() => {
              setGeneratedShare(null);
              setShowShareQrModal(true);
            }}
          >
            <QrCode size={16} />
            Share via QR
          </Button>

          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setShowExportModal(true)}
          >
            <Download size={16} />
            Export Records (PDF)
          </Button>

          <Link href="/records/new">
            <Button variant="primary" className="gap-2 w-full sm:w-auto">
              <Plus size={16} />
              Add Record
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <SearchBar onSearch={handleSearch} initialValue={search} placeholder="Search records by title..." />
        </div>
        <FilterPopover 
          groups={[{
            id: "category",
            label: "Category",
            options: CATEGORIES.filter(c => c.value !== "").map(c => ({
              label: c.label,
              value: c.value
            }))
          }]} 
          activeFilters={category ? { category } : {}} 
          onFilterChange={(f) => handleCategoryChange(f.category || "")} 
        />
      </div>

      {/* Content */}
      {error ? (
        <Card className="p-12 flex flex-col items-center text-center">
          <div className="h-12 w-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-4">
            <Activity size={24} />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-1">We couldn&apos;t load your records.</h3>
          <p className="text-slate-500 mb-6">Please check your connection and try again.</p>
          <Button variant="outline" onClick={loadRecords}>Try again</Button>
        </Card>
      ) : loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="p-4">
              <div className="flex gap-4 items-start">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-1/3" />
                  <Skeleton className="h-4 w-1/4" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : records.length === 0 ? (
        <EmptyState 
          icon={FileText}
          title={search || category ? "No records match your filters" : "No health records yet"}
          description={search || category ? "Try adjusting your search or category filters to find what you're looking for." : "Your medical records will appear here when you add your first record or receive one from a healthcare provider."}
          action={
            !search && !category ? (
              <Link href="/records/new">
                <Button variant="outline">Add your first record</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          {records.map(record => (
            <Link key={record.id} href={`/records/${record.id}`} className="block">
              <Card className="transition-shadow hover:shadow-md cursor-pointer border border-slate-200">
                <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 shrink-0 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center border border-teal-100">
                      <FileText size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-bold tracking-wider text-teal-700 uppercase">
                          {formatCategory(record.category)}
                        </span>
                        {record.lifecycleStatus !== "ACTIVE" && (
                          <Badge variant={getStatusVariant(record.lifecycleStatus)}>
                            {record.lifecycleStatus}
                          </Badge>
                        )}
                      </div>
                      <h3 className="text-base font-semibold text-slate-900 leading-snug">
                        {record.title || "Untitled Record"}
                      </h3>
                      <div className="flex items-center gap-3 mt-1.5 text-sm text-slate-500">
                        <div className="flex items-center gap-1.5">
                          <Calendar size={14} />
                          {new Date(record.occurredAt).toLocaleDateString(undefined, { 
                            year: 'numeric', month: 'short', day: 'numeric' 
                          })}
                        </div>
                        <span className="hidden sm:inline text-slate-300">•</span>
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{formatProvenance(record.provenanceStatus)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="shrink-0 flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 border-slate-100 pt-3 sm:pt-0 mt-3 sm:mt-0">
                    <span className="text-teal-600 text-sm font-medium sm:hidden flex items-center gap-1">
                      View details <ChevronRight size={16} />
                    </span>
                    <span className="hidden sm:flex text-slate-400 group-hover:text-teal-600 transition-colors">
                      <ChevronRight size={20} />
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 pt-6 mt-6">
              <p className="text-sm text-slate-500">
                Showing <span className="font-medium text-slate-900">{((pagination.page - 1) * pagination.pageSize) + 1}</span> to <span className="font-medium text-slate-900">{Math.min(pagination.page * pagination.pageSize, pagination.total)}</span> of <span className="font-medium text-slate-900">{pagination.total}</span> records
              </p>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={page === 1}
                  onClick={handlePrev}
                  className="h-8 px-2"
                >
                  <ChevronLeft size={16} />
                </Button>
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium px-2">{page}</span>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={page === pagination.totalPages}
                  onClick={handleNext}
                  className="h-8 px-2"
                >
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Export Records Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b mb-4">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <FileArchive className="w-5 h-5 text-teal-600" />
                Export Medical Records
              </h3>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Generate a tamper-evident consolidated medical history PDF suitable for sharing with doctors or printing.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Filter by Category</label>
                <select
                  value={exportCategory}
                  onChange={(e) => setExportCategory(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                >
                  <option value="">All Categories (Full History)</option>
                  {CATEGORIES.filter(c => c.value !== "").map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">From Date</label>
                  <input
                    type="date"
                    value={exportDateFrom}
                    onChange={(e) => setExportDateFrom(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">To Date</label>
                  <input
                    type="date"
                    value={exportDateTo}
                    onChange={(e) => setExportDateTo(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                  />
                </div>
              </div>

              <div className="p-3 bg-teal-50 border border-teal-100 rounded-lg text-xs text-teal-800">
                All records, lab values, prescriptions, and clean attachments are authenticated via cryptographic hash stamps.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setShowExportModal(false)} disabled={isExporting}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={handleExportPdf} disabled={isExporting}>
                  {isExporting ? "Generating..." : "Download PDF Bundle"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR Share Modal (24-Hour Expiry) */}
      {showShareQrModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b mb-4">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <QrCode className="w-5 h-5 text-teal-600" />
                Share Reports via QR Code
              </h3>
              <button
                onClick={resetShareModal}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            {!generatedShare ? (
              <div className="space-y-4">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
                  <p className="font-semibold flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-amber-600" />
                    Strict 24-Hour Access Policy
                  </p>
                  <p>
                    All QR shares automatically expire 24 hours from creation. For security and privacy, recipients must authenticate (or register) before accessing the shared documents.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Share Title / Label (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Recent Blood Tests & Consultation"
                    value={shareTitle}
                    onChange={(e) => setShareTitle(e.target.value)}
                    maxLength={100}
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-semibold text-slate-700 uppercase">
                      Select Medical Records to Share ({selectedRecordIds.length} selected)
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedRecordIds.length === records.length) {
                          setSelectedRecordIds([]);
                        } else {
                          setSelectedRecordIds(records.map((r) => r.id));
                        }
                      }}
                      className="text-xs text-teal-700 hover:underline font-medium"
                    >
                      {selectedRecordIds.length === records.length ? "Deselect All" : "Select All"}
                    </button>
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-2 border border-slate-200 rounded-xl p-2 bg-slate-50/50">
                    {records.length === 0 ? (
                      <p className="text-xs text-slate-400 p-3 text-center">No records available to select.</p>
                    ) : (
                      records.map((record) => {
                        const isSelected = selectedRecordIds.includes(record.id);
                        return (
                          <div
                            key={record.id}
                            onClick={() => toggleRecordSelection(record.id)}
                            className={`p-3 rounded-lg border text-xs cursor-pointer flex items-center justify-between transition-colors ${
                              isSelected
                                ? "bg-teal-50 border-teal-300 text-teal-900"
                                : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 pr-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}} // handled by parent div onClick
                                className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                              />
                              <div className="truncate">
                                <p className="font-semibold text-slate-900 truncate">
                                  {record.title || `${record.category} Record`}
                                </p>
                                <p className="text-slate-400 text-[11px]">
                                  {record.category} • {new Date(record.occurredAt).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                            <Badge variant="neutral" className="shrink-0 text-[10px]">
                              {record.provenanceStatus}
                            </Badge>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <Button variant="outline" size="sm" onClick={resetShareModal} disabled={isGeneratingShare}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleGenerateShare}
                    disabled={isGeneratingShare || selectedRecordIds.length === 0}
                    className="gap-2 bg-teal-700 hover:bg-teal-800 text-white"
                  >
                    <QrCode size={15} />
                    {isGeneratingShare ? "Generating..." : `Generate QR Code (${selectedRecordIds.length})`}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-center">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2 text-left">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>24-Hour QR Share Active. Recipient will be prompted to log in or register before viewing.</span>
                </div>

                <div className="py-2 flex justify-center">
                  <QRCodeDisplay
                    value={`${typeof window !== "undefined" ? window.location.origin : ""}${generatedShare.shareUrl}`}
                    subtitle="Scan with camera to open secure HealthVault share link."
                    expiresInMinutes={1440}
                  />
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-left space-y-2">
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase">Direct Link</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`${typeof window !== "undefined" ? window.location.origin : ""}${generatedShare.shareUrl}`}
                      className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 font-mono text-slate-700 select-all"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCopyLink}
                      className="shrink-0 gap-1.5 text-xs text-teal-700 border-teal-200 hover:bg-teal-50"
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedLink ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Share via WhatsApp, SMS, or email. Access expires automatically at:{" "}
                    <span className="font-semibold text-slate-700">
                      {new Date(generatedShare.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })},{" "}
                      {new Date(generatedShare.expiresAt).toLocaleDateString()}
                    </span>
                  </p>
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <Button variant="primary" size="sm" onClick={resetShareModal} className="bg-teal-700 hover:bg-teal-800 text-white">
                    Done
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
