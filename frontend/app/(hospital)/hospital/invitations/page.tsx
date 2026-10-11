"use client";

import { useEffect, useState } from "react";
import { 
  UserPlus, 
  Mail, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  RefreshCw, 
  Send,
  Loader2
} from "lucide-react";
import { fetchWithAuth } from "../../../../lib/api-client";

interface Department {
  id: string;
  name: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | "CANCELLED";
  expiresAt: string;
  createdAt: string;
  department: Department | null;
}

export default function HospitalInvitationsPage() {
  const [hospitalId, setHospitalId] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite modal form
  const [showModal, setShowModal] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [roleInput, setRoleInput] = useState("DOCTOR");
  const [deptInput, setDeptInput] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const res = await fetchWithAuth("/hospitals");
        if (res.ok) {
          const data = await res.json();
          if (data.length > 0) {
            setHospitalId(data[0].id);
          }
        }
      } catch {
        setError("Failed to resolve hospital membership");
      }
    }
    init();
  }, []);

  const loadData = async () => {
    if (!hospitalId) return;
    setLoading(true);
    setError(null);
    try {
      const [invRes, deptRes] = await Promise.all([
        fetchWithAuth(`/hospitals/${hospitalId}/invitations`),
        fetchWithAuth(`/hospitals/${hospitalId}/departments`)
      ]);

      if (invRes.ok) {
        const invData = await invRes.json();
        setInvitations(invData);
      }
      if (deptRes.ok) {
        const deptData = await deptRes.json();
        setDepartments(deptData);
      }
    } catch {
      setError("Failed to load hospital invitations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hospitalId) loadData();
  }, [hospitalId]);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hospitalId || !emailInput) return;

    setSendingInvite(true);
    setError(null);
    setInviteSuccess(null);

    try {
      const res = await fetchWithAuth(`/hospitals/${hospitalId}/invitations`, {
        method: "POST",
        body: JSON.stringify({
          email: emailInput,
          role: roleInput,
          departmentId: deptInput || undefined
        })
      });

      const data = await res.json();
      if (res.ok) {
        setInviteSuccess(`Invitation link dispatched to ${emailInput}`);
        setEmailInput("");
        setShowModal(false);
        await loadData();
      } else {
        setError(data.error || "Failed to send invitation");
      }
    } catch {
      setError("Network error sending invitation");
    } finally {
      setSendingInvite(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center">
            <Mail className="w-7 h-7 mr-3 text-blue-600" /> Doctor & Staff Invitations
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Invite verified medical practitioners and clinical staff to join your hospital organization.
          </p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={loadData}
            className="flex items-center text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg border border-slate-300"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg shadow-sm"
          >
            <UserPlus className="w-4 h-4 mr-1.5" /> Invite Doctor
          </button>
        </div>
      </div>

      {inviteSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex items-center">
          <CheckCircle2 className="w-5 h-5 mr-3 flex-shrink-0 text-emerald-600" />
          {inviteSuccess}
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm flex items-center">
          <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0 text-rose-600" />
          {error}
        </div>
      )}

      {/* Invitations Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-slate-500 flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-2" />
            <p className="text-sm">Loading invitations...</p>
          </div>
        ) : invitations.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            <Mail className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="font-medium text-slate-700">No active invitations dispatched yet.</p>
            <p className="text-xs text-slate-400 mt-1">Click "Invite Doctor" to onboard medical staff.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 uppercase text-[11px] font-bold tracking-wider border-b border-slate-200">
                  <th className="py-3 px-4">Recipient Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Dispatched At</th>
                  <th className="py-3 px-4">Expires At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {invitations.map(inv => (
                  <tr key={inv.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4 font-medium text-slate-900">{inv.email}</td>
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-300">
                        {inv.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      {inv.department?.name || <span className="text-slate-400 italic">General</span>}
                    </td>
                    <td className="py-3.5 px-4">
                      {inv.status === "ACCEPTED" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> ACCEPTED
                        </span>
                      ) : inv.status === "PENDING" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800">
                          <Clock className="w-3 h-3 mr-1" /> PENDING
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-600">
                          {inv.status}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-500">
                      {new Date(inv.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-500">
                      {new Date(inv.expiresAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 border-b pb-2 flex items-center">
              <UserPlus className="w-5 h-5 text-blue-600 mr-2" /> Invite Doctor or Staff
            </h3>

            <form onSubmit={handleSendInvite} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Recipient Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="doctor@example.com"
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Assigned Membership Role *
                </label>
                <select
                  value={roleInput}
                  onChange={(e) => setRoleInput(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                >
                  <option value="DOCTOR">DOCTOR</option>
                  <option value="STAFF">STAFF</option>
                  <option value="HOSPITAL_ADMIN">HOSPITAL ADMIN</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Department (Optional)
                </label>
                <select
                  value={deptInput}
                  onChange={(e) => setDeptInput(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                >
                  <option value="">General / Unassigned</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingInvite}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm flex items-center disabled:opacity-50"
                >
                  {sendingInvite ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
                  Dispatch Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
