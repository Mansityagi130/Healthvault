"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAuth, setAccessToken } from "@/lib/api-client";
import { LayoutDashboard, FileText } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";

export default function LabLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Next.js / React temporary strictness disable
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetchWithAuth("/auth/me");
        if (!res.ok) throw new Error("Not authenticated");
        const data = await res.json();
        const u = data.user || data;
        const roles = u.roles || [];
        if (!roles.includes("LAB_USER") && !roles.includes("LAB_ADMIN") && !roles.includes("LAB_TECHNICIAN") && !u.isPlatformAdmin) {
          router.push("/dashboard");
          return;
        }
        setUser(u);
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Next.js / React temporary strictness disable
      } catch (err) {
        router.push("/login");
      }
    };
    checkAuth();
  }, [router]);

  const handleLogout = async () => {
    try {
      await fetchWithAuth("/auth/logout", { method: "POST" });
    } finally {
      setAccessToken(null);
      router.push("/login");
    }
  };

  if (!user) return <div suppressHydrationWarning className="min-h-screen flex items-center justify-center">Loading...</div>;

  const navItems = [
    { name: "Dashboard", href: "/lab/dashboard", icon: LayoutDashboard },
    { name: "Lab Reports", href: "/lab/reports", icon: FileText }
  ];

  const switchRole = (r: string) => {
    if (r === "PATIENT") router.push("/dashboard");
    if (r === "PROVIDER") router.push("/provider/dashboard");
    if (r === "HOSPITAL_ADMIN" || r === "HOSPITAL_STAFF") router.push("/hospital/dashboard");
  };

  return (
    <AppShell
      user={user}
      navItems={navItems}
      title="HealthVault"
      roleSubtitle="Laboratory Portal"
      onLogout={handleLogout}
      roles={user?.roles || ["LAB_TECHNICIAN"]}
      currentRole="LAB_TECHNICIAN"
      onRoleSwitch={switchRole}
    >
      <div className="p-4 sm:p-6 lg:p-8 w-full max-w-7xl mx-auto">
        <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between text-xs text-amber-800">
          <div className="flex items-center gap-2">
            <span className="font-bold uppercase tracking-wider bg-amber-200 text-amber-900 px-2 py-0.5 rounded text-3xs">Prototype Preview</span>
            <span>This laboratory interface is a development prototype and is not connected to live external diagnostic machines.</span>
          </div>
        </div>
        {children}
      </div>
    </AppShell>
  );
}
