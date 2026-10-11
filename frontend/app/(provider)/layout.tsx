"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithAuth, setAccessToken } from "@/lib/api-client";
import { LayoutDashboard, QrCode } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";

export default function ProviderLayout({ children }: { children: React.ReactNode }) {
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
        if (!roles.includes("DOCTOR") && !u.isPlatformAdmin) {
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

  if (!user) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  const navItems = [
    { name: "Dashboard", href: "/provider/dashboard", icon: LayoutDashboard },
    { name: "Appointments", href: "/provider/appointments", icon: LayoutDashboard },
    { name: "Encounters", href: "/provider/encounters", icon: LayoutDashboard },
    { name: "Scan QR", href: "/provider/scan", icon: QrCode },
    { name: "Emergency Break-Glass", href: "/provider/emergency", icon: QrCode },
  ];

  const switchRole = (r: string) => {
    if (r === "PATIENT") router.push("/dashboard");
    if (r === "HOSPITAL_ADMIN" || r === "HOSPITAL_STAFF") router.push("/hospital/dashboard");
    if (r === "LAB_TECHNICIAN" || r === "LAB_ADMIN") router.push("/lab/dashboard");
  };

  return (
    <AppShell
      user={user}
      navItems={navItems}
      title="HealthVault"
      roleSubtitle="Provider Portal"
      onLogout={handleLogout}
      roles={user?.roles || ["PROVIDER"]}
      currentRole="PROVIDER"
      onRoleSwitch={switchRole}
    >
      <div className="p-4 sm:p-6 lg:p-8 w-full max-w-full mx-auto">
        <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between text-xs text-amber-800">
          <div className="flex items-center gap-2">
            <span className="font-bold uppercase tracking-wider bg-amber-200 text-amber-900 px-2 py-0.5 rounded text-3xs">Prototype Preview</span>
            <span>This provider interface is a development prototype and is not connected to verified external medical registries.</span>
          </div>
        </div>
        {children}
      </div>
    </AppShell>
  );
}
