"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { fetchWithAuth } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { FlaskConical, FileText, Activity } from "lucide-react";

export default function LabDashboard() {
  const [stats, setStats] = useState<{ draftCount: number; pendingOrdersCount: number; finalizedTodayCount: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const labsRes = await fetchWithAuth("/labs");
        const labs = await labsRes.json();
        if (Array.isArray(labs) && labs.length > 0) {
          const statsRes = await fetchWithAuth(`/labs/${labs[0].id}/stats`);
          if (statsRes.ok) {
            const data = await statsRes.json();
            setStats(data);
          }
        }
      } catch (err) {
        console.error("Failed to load lab stats", err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Laboratory Operations</h1>
          <p className="text-slate-500 mt-1">Manage tests, results, and verify clinical data.</p>
        </div>
        <Link href="/lab/reports/new">
          <Button variant="primary" className="gap-2 w-full sm:w-auto">
            <FlaskConical size={16} />
            Create Report
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center">
                <FileText size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Draft Reports</p>
                {loading ? <Skeleton className="h-8 w-12 mt-1" /> : <p className="text-2xl font-bold text-slate-900">{stats?.draftCount ?? 0}</p>}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Activity size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Pending Tests</p>
                {loading ? <Skeleton className="h-8 w-12 mt-1" /> : <p className="text-2xl font-bold text-slate-900">{stats?.pendingOrdersCount ?? 0}</p>}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-slate-50 text-slate-600 flex items-center justify-center">
                <FlaskConical size={24} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Finalized Today</p>
                {loading ? <Skeleton className="h-8 w-12 mt-1" /> : <p className="text-2xl font-bold text-slate-900">{stats?.finalizedTodayCount ?? 0}</p>}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Drafts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-slate-500">
            No drafts currently require attention.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
