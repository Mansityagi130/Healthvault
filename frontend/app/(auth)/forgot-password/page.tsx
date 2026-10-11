"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { fetchWithAuth } from "@/lib/api-client";

export default function ForgotPasswordPage() {
  const [identity, setIdentity] = useState("");
  const [message, setMessage] = useState("");
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setDevResetUrl(null);
    setLoading(true);

    try {
      const res = await fetchWithAuth("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ identity }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Request failed");
      }

      const data = await res.json();
      setMessage(data.message || "If the account exists, password reset instructions have been sent.");
      if (data.devResetUrl) {
        setDevResetUrl(data.devResetUrl);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h3 className="text-xl font-semibold text-slate-900 mb-2">Forgot Password</h3>
      <p className="text-sm text-slate-500 mb-6">
        Enter your email address or phone number, and we will send you instructions to reset your password.
      </p>

      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm mb-6 border border-red-200">
          {error}
        </div>
      )}

      {message ? (
        <div className="bg-green-50 text-green-800 p-4 rounded-lg text-sm mb-6 border border-green-200">
          <p>{message}</p>
          {devResetUrl && (
            <div className="mt-4 p-3 bg-white border border-green-300 rounded-lg">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">
                Demo / Local Testing Mode
              </p>
              <Link
                href={devResetUrl}
                className="inline-flex items-center justify-center w-full py-2 px-3 bg-teal-700 hover:bg-teal-800 text-white rounded-md text-xs font-semibold shadow-sm transition-colors"
              >
                Reset Password Now →
              </Link>
            </div>
          )}
          <div className="mt-4 text-center">
            <Link href="/login" className="font-medium text-teal-700 hover:text-teal-800 text-xs">
              Return to Login
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email or Phone
            </label>
            <input
              type="text"
              required
              value={identity}
              onChange={(e) => setIdentity(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600 text-slate-900"
              placeholder="john@example.com"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-600 disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <Loader2 className="animate-spin h-5 w-5" /> : "Send Reset Instructions"}
          </button>

          <div className="text-center mt-4">
            <Link href="/login" className="text-sm font-medium text-teal-700 hover:text-teal-800">
              Back to Login
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
