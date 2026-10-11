"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Loader2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { API_URL } from "../../../lib/api-client";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState<string>("");
  const [patientIdDisplay, setPatientIdDisplay] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Missing verification token. Please check your verification email link.");
      return;
    }

    async function verify() {
      try {
        const res = await fetch(`${API_URL}/auth/verify-email?token=${encodeURIComponent(token!)}`);
        const data = await res.json();

        if (res.ok) {
          setStatus("success");
          setMessage(data.message || "Email verified successfully!");
          setPatientIdDisplay(data.patientIdDisplay || null);
        } else {
          setStatus("error");
          setMessage(data.error || "Failed to verify email.");
        }
      } catch {
        setStatus("error");
        setMessage("Network error verifying email.");
      }
    }

    verify();
  }, [token]);

  const redirectParam = searchParams.get("redirect");
  const loginUrl = redirectParam ? `/login?redirect=${encodeURIComponent(redirectParam)}` : "/login";

  return (
    <div className="text-center space-y-6">
      {status === "loading" && (
        <div className="py-8 flex flex-col items-center justify-center space-y-4">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
          <h3 className="text-lg font-medium text-slate-800">Verifying your email address...</h3>
          <p className="text-sm text-slate-500">Please wait while we confirm your HealthVault account identity.</p>
        </div>
      )}

      {status === "success" && (
        <div className="py-4 space-y-4">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h3 className="text-2xl font-bold text-slate-900">Email Verified!</h3>
          <p className="text-slate-600 text-sm">{message}</p>

          {patientIdDisplay && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 my-4">
              <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold block mb-1">
                Your HealthVault Patient ID
              </span>
              <span className="text-2xl font-mono font-bold text-blue-600 tracking-wide">
                {patientIdDisplay}
              </span>
            </div>
          )}

          <div className="pt-4">
            <button
              onClick={() => router.push(loginUrl)}
              className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none"
            >
              Proceed to Sign In <ArrowRight className="ml-2 w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="py-4 space-y-4">
          <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto text-rose-600">
            <XCircle className="w-10 h-10" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">Verification Failed</h3>
          <p className="text-rose-600 text-sm bg-rose-50 p-3 rounded-lg border border-rose-200">{message}</p>

          <div className="pt-4 space-y-2">
            <Link
              href={loginUrl}
              className="block w-full py-2.5 px-4 text-center border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50"
            >
              Back to Login
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="text-center py-8 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
        <p className="text-sm text-slate-500">Loading verification token...</p>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
