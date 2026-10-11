"use client";

import React, { useState, useEffect, useCallback } from "react";
import { fetchWithAuth } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Shield, Clock, FileText, Lock, ChevronLeft, ChevronRight, Loader2, AlertCircle } from "lucide-react";

interface AuditLog {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  occurredAt: string;
  metadata: Record<string, any> | null;
  actor: {
    id: string;
    email: string | null;
    publicId: string;
  } | null;
}

interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export default function HospitalAuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({ page: 1, pageSize: 15, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const loadHospitalAuditLogs = useCallback(async (pageToLoad: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchWithAuth(`/audit-logs?page=${pageToLoad}&pageSize=15`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setPagination(data.pagination || { page: pageToLoad, pageSize: 15, total: 0, totalPages: 1 });
      } else {
        setError("Failed to load hospital security audit logs.");
      }
    } catch (err) {
      console.error("Error loading hospital audit logs:", err);
      setError("An error occurred while connecting to the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHospitalAuditLogs(1);
  }, [loadHospitalAuditLogs]);

  const getActionBadgeColor = (action: string) => {
    if (action.includes("LOGIN") || action.includes("APPROVED")) return "bg-green-100 text-green-800 border-green-200";
    if (action.includes("FAILED") || action.includes("REJECTED") || action.includes("REVOKED")) return "bg-red-100 text-red-800 border-red-200";
    if (action.includes("UPDATE") || action.includes("MEMBER")) return "bg-purple-100 text-purple-800 border-purple-200";
    return "bg-slate-100 text-slate-800 border-slate-200";
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Shield className="h-6 w-6 text-purple-600" /> Hospital Security Audit Log
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Monitor administrative actions, staff security events, and hospital tenant activity logs.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Card>
        <CardHeader className="border-b border-slate-100 bg-slate-50/50">
          <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-500" /> Staff & Tenant Activity Logs
          </CardTitle>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin mr-2 text-purple-600" /> Loading hospital audit records...
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <FileText className="h-10 w-10 mx-auto mb-2 text-slate-300" />
              <p className="font-medium text-slate-600">No hospital audit logs recorded yet</p>
              <p className="text-xs text-slate-400 mt-1">Staff activities will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {logs.map((log) => (
                <div key={log.id} className="p-4 hover:bg-slate-50/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={getActionBadgeColor(log.action)}>
                        {log.action}
                      </Badge>
                      {log.targetType && (
                        <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                          {log.targetType}
                        </span>
                      )}
                      {log.actor?.email && (
                        <span className="text-xs text-slate-600 font-medium bg-purple-50 text-purple-700 px-2 py-0.5 rounded">
                          User: {log.actor.email}
                        </span>
                      )}
                    </div>
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <p className="text-xs font-mono text-slate-500 mt-1 bg-slate-50 p-1.5 rounded border border-slate-100 max-w-xl truncate">
                        {JSON.stringify(log.metadata)}
                      </p>
                    )}
                  </div>

                  <div className="text-right text-xs text-slate-500 shrink-0">
                    <div className="flex items-center sm:justify-end gap-1 text-slate-600 font-medium">
                      <Lock className="h-3 w-3 text-slate-400" />
                      {new Date(log.occurredAt).toLocaleDateString()} at {new Date(log.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination Footer */}
      {!loading && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-slate-500">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total events)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => loadHospitalAuditLogs(pagination.page - 1)}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => loadHospitalAuditLogs(pagination.page + 1)}
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
