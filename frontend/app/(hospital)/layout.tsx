"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAuth, setAccessToken } from "@/lib/api-client";
import { LayoutDashboard, Users, FileText, Mail } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";

export default function HospitalLayout({ children }: { children: React.ReactNode }) {
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
        if (!roles.includes("HOSPITAL_ADMIN") && !roles.includes("HOSPITAL_STAFF") && !u.isPlatformAdmin) {
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
    { name: "Dashboard", href: "/hospital/dashboard", icon: LayoutDashboard },
    { name: "Encounters", href: "/hospital/encounters", icon: FileText },
    { name: "Providers", href: "/hospital/providers", icon: Users },
    { name: "Invitations", href: "/hospital/invitations", icon: Mail }
  ];

  const switchRole = (r: string) => {
    if (r === "PATIENT") router.push("/dashboard");
    if (r === "PROVIDER") router.push("/provider/dashboard");
    if (r === "LAB_TECHNICIAN" || r === "LAB_ADMIN") router.push("/lab/dashboard");
  };

  return (
    <AppShell
      user={user}
      navItems={navItems}
      title="HealthVault"
      roleSubtitle="Hospital Portal"
      onLogout={handleLogout}
      roles={user?.roles || ["HOSPITAL_STAFF"]}
      currentRole="HOSPITAL_STAFF"
      onRoleSwitch={switchRole}
    >
      <div className="p-4 sm:p-6 lg:p-8 w-full max-w-7xl mx-auto">
        <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between text-xs text-amber-800">
          <div className="flex items-center gap-2">
            <span className="font-bold uppercase tracking-wider bg-amber-200 text-amber-900 px-2 py-0.5 rounded text-3xs">Prototype Preview</span>
            <span>This hospital interface is a development prototype and is not connected to live external hospital EHR systems.</span>
          </div>
        </div>
        {children}
      </div>
    </AppShell>
  );
}
