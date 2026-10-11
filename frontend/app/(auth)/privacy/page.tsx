import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export default function PrivacyPolicyPage() {
  return (
    <div className="space-y-6 text-slate-800">
      <div className="border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2 text-teal-700 mb-2">
          <ShieldCheck size={24} />
          <span className="text-xs font-semibold uppercase tracking-wider">Privacy Notice</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">HealthVault Privacy Disclosure</h1>
        <p className="text-xs text-slate-500 mt-1">
          Status: Prototype / Demonstration Release &bull; Last updated: October 2026
        </p>
      </div>

      <div className="space-y-4 text-xs leading-relaxed">
        <section>
          <h2 className="text-sm font-semibold text-slate-900 mb-1">1. Scope and Deployment Context</h2>
          <p>
            HealthVault is an open-architecture digital health record wallet designed for secure storage and consent-driven clinical sharing. This platform is currently operated as a development and demonstration release.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-slate-900 mb-1">2. Categories of Information Processed</h2>
          <ul className="list-disc pl-4 space-y-1 mt-1 text-slate-600">
            <li><strong>Account &amp; Profile Data:</strong> Full name, verified email address, optional contact number, and authentication credentials (hashed passwords and TOTP MFA secrets).</li>
            <li><strong>Clinical &amp; Medical Records:</strong> Consultations, prescriptions, diagnostic reports, laboratory results, and uploaded medical documents.</li>
            <li><strong>Audit &amp; Security Telemetry:</strong> Access logs, session timestamps, IP addresses, consent approvals, and document security scan outcomes.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-slate-900 mb-1">3. Purpose of Processing &amp; Consent</h2>
          <p>
            Personal health data is processed solely for patient-directed medical record organization, appointment scheduling, laboratory integrations, and explicit, time-bounded sharing with verified healthcare providers. Patients may revoke active sharing sessions at any time via the Sharing &amp; Consent dashboard.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-slate-900 mb-1">4. Cookies and Technical Storage</h2>
          <p>
            HealthVault uses only strictly necessary technical cookies (such as httpOnly session tokens) and temporary session storage for multi-factor authentication. No advertising, third-party behavioral profiling, or marketing tracking scripts are used.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-slate-900 mb-1">5. Security Safeguards</h2>
          <p>
            All uploaded files undergo automated antivirus scanning (via ClamAV signature pipelines) and are quarantined prior to clearance. Data access strictly enforces role-based access control (RBAC), multi-tenant isolation, and SHA-256 cryptographic token hashing.
          </p>
        </section>

        <section className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900">
          <h2 className="text-xs font-bold uppercase tracking-wider mb-1">6. Entity &amp; Grievance Redressal [Pending Legal Review]</h2>
          <p className="text-[11px] text-amber-800">
            Formal business entity registration, physical registered office address, and statutory Data Protection Officer / Grievance Officer appointments under the Digital Personal Data Protection (DPDP) Act, 2023 are pending business and legal finalization prior to production launch.
          </p>
        </section>
      </div>

      <div className="pt-4 border-t border-slate-200 flex justify-between items-center text-xs">
        <Link href="/register" className="inline-flex items-center text-teal-700 hover:text-teal-800 font-medium">
          <ArrowLeft size={14} className="mr-1" /> Back to Registration
        </Link>
        <Link href="/login" className="text-slate-500 hover:text-slate-700 font-medium">
          Sign In
        </Link>
      </div>
    </div>
  );
}
