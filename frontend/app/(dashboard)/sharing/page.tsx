"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { fetchWithAuth } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Plus, Share2, Clock, CheckCircle2, XCircle, QrCode, ShieldAlert, Eye } from "lucide-react";

interface SharingSession {
  id: string;
  grantee: {
    doctorProfile: {
      firstName?: string;
      lastName?: string;
      specialty?: string;
    };
  };
  purposeSnapshot: string;
  status: string;
  startsAt: string;
  expiresAt: string;
  scopes: { recordCategory: string }[];
}

interface PatientReportShareItem {
  id: string;
  selector: string;
  title: string | null;
  recordCount: number;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  accessCount: number;
  lastAccessedAt: string | null;
  isExpired: boolean;
  isRevoked: boolean;
}

export default function SharingPage() {
  const [activeTab, setActiveTab] = useState<"qr" | "provider">("qr");

  // Provider sessions
  const [sessions, setSessions] = useState<SharingSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  // QR Report shares
  const [reportShares, setReportShares] = useState<PatientReportShareItem[]>([]);
  const [reportSharesLoading, setReportSharesLoading] = useState(true);

  const loadSessions = async () => {
    setSessionsLoading(true);
    try {
      const res = await fetchWithAuth("/patient/sharing");
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSessionsLoading(false);
    }
  };

  const loadReportShares = async () => {
    setReportSharesLoading(true);
    try {
      const res = await fetchWithAuth("/patient/report-shares");
      if (res.ok) {
        const data = await res.json();
        setReportShares(data.shares || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setReportSharesLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
    loadReportShares();
  }, []);

  const handleRevokeSession = async (id: string) => {
    if (!confirm("Are you sure you want to revoke this provider session immediately?")) return;
    try {
      const res = await fetchWithAuth(`/patient/sharing/${id}/revoke`, { method: "POST" });
      if (res.ok) {
        loadSessions();
      }
    } catch {
      alert("Failed to revoke session");
    }
  };

  const handleRevokeReportShare = async (id: string) => {
    if (!confirm("Are you sure you want to revoke this QR share link immediately? Recipient access will be blocked.")) return;
    try {
      const res = await fetchWithAuth(`/patient/report-shares/${id}/revoke`, { method: "DELETE" });
      if (res.ok) {
        loadReportShares();
      }
    } catch {
      alert("Failed to revoke QR share");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Shared Access</h1>
          <p className="text-slate-500 mt-1">Manage temporary access given via QR codes or to healthcare providers.</p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/sharing/new">
            <Button variant="primary" className="gap-2">
              <QrCode size={16} />
              Generate QR Code
            </Button>
          </Link>
          <Link href="/sharing/new?mode=provider">
            <Button variant="outline" className="gap-2">
              <Plus size={16} />
              Doctor / Provider Share
            </Button>
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab("qr")}
          className={`pb-3 px-4 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === "qr"
              ? "border-teal-700 text-teal-700"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <QrCode className="w-4 h-4" />
          Patient QR Shares (24-Hour Expiry)
          {reportShares.filter((s) => !s.isExpired && !s.isRevoked).length > 0 && (
            <span className="bg-teal-100 text-teal-800 text-xs px-2 py-0.5 rounded-full font-bold">
              {reportShares.filter((s) => !s.isExpired && !s.isRevoked).length} Active
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("provider")}
          className={`pb-3 px-4 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === "provider"
              ? "border-teal-700 text-teal-700"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Share2 className="w-4 h-4" />
          Provider Encounters & Consents
        </button>
      </div>

      {/* Tab 1: QR Report Shares */}
      {activeTab === "qr" && (
        <div>
          {reportSharesLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
          ) : reportShares.length === 0 ? (
            <EmptyState
              icon={QrCode}
              title="No active QR report shares"
              description="Generate a secure 24-hour shareable QR code instantly (no doctor or record selection needed), or select specific reports from your Health Records."
              action={
                <div className="flex flex-wrap gap-2 justify-center">
                  <Link href="/sharing/new">
                    <Button variant="primary" className="gap-1.5">
                      <QrCode size={16} />
                      Generate Instant QR Code
                    </Button>
                  </Link>
                  <Link href="/records">
                    <Button variant="outline">Select Specific Records</Button>
                  </Link>
                </div>
              }
            />
          ) : (
            <div className="space-y-4">
              {reportShares.map((share) => {
                const isActive = !share.isExpired && !share.isRevoked;
                return (
                  <Card key={share.id} className="border-slate-200 shadow-2xs">
                    <CardContent className="p-5 flex flex-col sm:flex-row justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2.5">
                          {isActive ? (
                            <Badge variant="success" className="gap-1">
                              <CheckCircle2 size={12} /> Active (24-Hr Window)
                            </Badge>
                          ) : share.isRevoked ? (
                            <Badge variant="error" className="gap-1">
                              <ShieldAlert size={12} /> Revoked by You
                            </Badge>
                          ) : (
                            <Badge variant="neutral" className="gap-1">
                              <Clock size={12} /> Expired
                            </Badge>
                          )}
                          <h3 className="text-sm font-bold text-slate-900">
                            {share.title || "QR Report Share"}
                          </h3>
                        </div>

                        <p className="text-xs text-slate-600">
                          <span className="font-medium text-slate-800">{share.recordCount}</span> medical{" "}
                          {share.recordCount === 1 ? "record" : "records"} included • Accessed{" "}
                          <span className="font-medium text-slate-800">{share.accessCount}</span>{" "}
                          {share.accessCount === 1 ? "time" : "times"}
                        </p>

                        <div className="text-xs text-slate-400 flex flex-wrap gap-4 pt-1">
                          <span>Created: {new Date(share.createdAt).toLocaleDateString()}</span>
                          <span className="flex items-center gap-1 text-amber-700">
                            <Clock size={12} />
                            Expires: {new Date(share.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })},{" "}
                            {new Date(share.expiresAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      <div className="flex sm:flex-col justify-end sm:items-end gap-2 pt-2 sm:pt-0">
                        {isActive && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRevokeReportShare(share.id)}
                            className="text-xs text-red-600 border-red-200 hover:bg-red-50"
                          >
                            Revoke Link
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Provider Consents */}
      {activeTab === "provider" && (
        <div>
          {sessionsLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          ) : sessions.length === 0 ? (
            <EmptyState
              icon={Share2}
              title="No provider sharing sessions"
              description="You haven't shared your records directly with any registered providers yet."
              action={
                <Link href="/sharing/new">
                  <Button variant="outline">Share with a provider</Button>
                </Link>
              }
            />
          ) : (
            <div className="space-y-4">
              {sessions.map((session) => (
                <Card key={session.id} className="border-slate-200">
                  <CardContent className="p-5 flex flex-col sm:flex-row justify-between gap-6">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        {session.status === "ACTIVE" && new Date(session.expiresAt) > new Date() ? (
                          <Badge variant="success" className="gap-1">
                            <CheckCircle2 size={12} /> Active
                          </Badge>
                        ) : session.status === "REVOKED" ? (
                          <Badge variant="error" className="gap-1">
                            <XCircle size={12} /> Revoked
                          </Badge>
                        ) : (
                          <Badge variant="neutral" className="gap-1">
                            <Clock size={12} /> Expired
                          </Badge>
                        )}
                        <span className="text-sm font-medium text-slate-900">
                          Dr. {session.grantee.doctorProfile?.firstName} {session.grantee.doctorProfile?.lastName}
                        </span>
                      </div>

                      <p className="text-sm text-slate-600 mb-3">{session.purposeSnapshot}</p>

                      <div className="flex flex-wrap gap-2 mb-3">
                        {session.scopes.map((s) => (
                          <span
                            key={s.recordCategory}
                            className="px-2 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-md uppercase tracking-wider"
                          >
                            {s.recordCategory.replace("_", " ")}
                          </span>
                        ))}
                      </div>

                      <p className="text-xs text-slate-400 flex items-center gap-1.5">
                        <Clock size={14} /> Expires: {new Date(session.expiresAt).toLocaleString()}
                      </p>
                    </div>

                    <div className="flex items-end">
                      {session.status === "ACTIVE" && new Date(session.expiresAt) > new Date() && (
                        <Button variant="outline" size="sm" onClick={() => handleRevokeSession(session.id)}>
                          Revoke Access
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
