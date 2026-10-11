import Link from "next/link";
import { ArrowLeft, FileText, AlertTriangle } from "lucide-react";

export default function TermsOfServicePage() {
  return (
    <div className="space-y-6 text-slate-800">
      <div className="border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2 text-teal-700 mb-2">
          <FileText size={24} />
          <span className="text-xs font-semibold uppercase tracking-wider">Terms of Service</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">HealthVault Platform Terms</h1>
        <p className="text-xs text-slate-500 mt-1">
          Status: Prototype / Demonstration Release &bull; Last updated: October 2026
        </p>
      </div>

      <div className="space-y-4 text-xs leading-relaxed">
        <section className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-900 flex items-start gap-2">
          <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider mb-1">Important: Non-Emergency Disclaimer</h2>
            <p className="text-[11px] text-rose-800">
              HealthVault is an electronic health record repository and consent tool. It is <strong>NOT</strong> an emergency medical dispatch or urgent triage system. In any critical or life-threatening medical emergency, call your local emergency services (e.g. 112 / 108 in India) or visit the nearest hospital emergency department immediately.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-slate-900 mb-1">1. Patient Data Sovereignty</h2>
          <p>
            Patients retain sovereignty over records uploaded or aggregated in their personal HealthVault account. Sharing clinical records with doctors, hospitals, or laboratories requires affirmative, revocable consent.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-slate-900 mb-1">2. Acceptable Use Policy</h2>
          <p>
            Users agree not to: (a) upload infected, corrupted, or malicious files; (b) impersonate licensed medical practitioners or healthcare organizations; (c) tamper with finalized lab results or doctor consultations; or (d) attempt unauthorized cross-tenant data access.
          </p>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-slate-900 mb-1">3. Clinical Immutability</h2>
          <p>
            To uphold medical data integrity, verified doctor consultations, finalized lab reports, and signed prescriptions become immutable once published, in accordance with clinical documentation standards.
          </p>
        </section>

        <section className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900">
          <h2 className="text-xs font-bold uppercase tracking-wider mb-1">4. Operator Identity &amp; Governing Law [Pending Legal Review]</h2>
          <p className="text-[11px] text-amber-800">
            Corporate operating entity details, formal jurisdiction, dispute arbitration provisions, and commercial agreements are pending legal entity formalization prior to commercial deployment.
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
