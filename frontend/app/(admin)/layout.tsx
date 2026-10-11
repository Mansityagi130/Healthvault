"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { ShieldAlert, Building2, LogOut, FileText, CheckCircle2, LayoutDashboard, ShieldX } from "lucide-react";
import { fetchWithAuth, setAccessToken } from "../../lib/api-client";

export default function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [isForbidden, setIsForbidden] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetchWithAuth("/auth/me");
        if (!res.ok) throw new Error("Not authenticated");
        const data = await res.json();
        const u = data.user || data;
        const roles = u.roles || [];
        if (!u.isPlatformAdmin && !roles.includes("PLATFORM_ADMIN")) {
          setIsForbidden(true);
          setLoading(false);
          router.push("/dashboard");
          return;
        }
        setLoading(false);
      } catch {
        router.push("/login");
      }
    };
    checkAuth();
  }, [router]);

  const handleLogout = () => {
    setAccessToken(null);
    router.push("/login");
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center font-sans text-slate-500">Verifying authorization...</div>;
  }

  if (isForbidden) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-white rounded-2xl border border-rose-200 shadow-xl p-8 text-center space-y-4">
          <div className="h-14 w-14 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
            <ShieldX className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">403 — Forbidden</h1>
          <p className="text-sm text-slate-600">
            HealthVault Platform Admin authorization required. Ordinary patient, doctor, and hospital accounts cannot access this administrative portal.
          </p>
          <div className="pt-2">
            <Link
              href="/dashboard"
              className="inline-block px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 transition"
            >
              Return to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* Platform Admin Header */}
      <header className="bg-slate-900 text-white shadow-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 bg-rose-600 rounded-lg flex items-center justify-center font-bold text-white shadow">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight">HealthVault Admin Portal</span>
              <span className="ml-2 text-xs bg-rose-900/80 text-rose-200 border border-rose-700/50 px-2 py-0.5 rounded font-mono">
                INTERNAL OVERSIGHT
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-6">
            <nav className="flex space-x-3">
              <Link
                href="/admin"
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  pathname === "/admin"
                    ? "bg-slate-800 text-white border border-slate-700"
                    : "text-slate-300 hover:text-white hover:bg-slate-800"
                }`}
              >
                <LayoutDashboard className="w-4 h-4 inline mr-1.5" />
                Overview
              </Link>
              <Link
                href="/admin/hospitals"
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  pathname.startsWith("/admin/hospitals")
                    ? "bg-slate-800 text-white border border-slate-700"
                    : "text-slate-300 hover:text-white hover:bg-slate-800"
                }`}
              >
                <Building2 className="w-4 h-4 inline mr-1.5" />
                Hospitals Review
              </Link>
            </nav>

            <button
              onClick={handleLogout}
              className="text-xs text-slate-400 hover:text-rose-400 flex items-center space-x-1"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Admin Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
