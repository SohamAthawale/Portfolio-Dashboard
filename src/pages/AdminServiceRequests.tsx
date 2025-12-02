import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { motion } from "framer-motion";
import { ClipboardList, Trash2, Mail, User } from "lucide-react";
import Logo from "../components/logo";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:5000";

type StatusType = "pending" | "processing" | "completed" | "rejected";

interface AdminRequest {
  id: number;
  user_id: number;
  member_id?: number | null;
  request_type: string;
  description?: string | null;
  status: StatusType;
  created_at: string;
  updated_at?: string | null;
  user_name: string;
  member_name?: string | null;
  admin_description?: string | null;
}

export const AdminServiceRequests: React.FC = () => {
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [globalAdminNote, setGlobalAdminNote] = useState<string>("");

  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/admin/service-requests`, { credentials: "include" });
        const data = await res.json();
        if (res.ok && Array.isArray(data)) setRequests(data);
        else console.error(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Update status and optionally include admin_description
  const updateStatus = async (id: number, status: StatusType, note?: string | null) => {
    setActionLoading(id);
    try {
      const res = await fetch(`${API_BASE}/admin/service-requests/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, admin_description: note ?? null }),
      });
      const json = await res.json();
      if (res.ok) {
        setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status, admin_description: note ?? r.admin_description } : r)));
      } else {
        alert(json.error || "Failed to update status");
      }
    } catch (e) {
      console.error(e);
      alert("Network error");
    } finally {
      setActionLoading(null);
    }
  };

  const deleteRequest = async (id: number) => {
    if (!window.confirm("Delete this request?")) return;
    try {
      const res = await fetch(`${API_BASE}/admin/service-requests/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (res.ok) {
        setRequests((prev) => prev.filter((r) => r.id !== id));
      } else {
        alert(json.error || "Failed to delete");
      }
    } catch (e) {
      console.error(e);
      alert("Network error");
    }
  };

  // Perform / execute the request (calls the perform endpoint)
  const handlePerform = (req: AdminRequest, perCardNote?: string | null) => {
    // If Portfolio Update -> open full page editor
    if (req.request_type === "Portfolio Update") {
      navigate(`/admin/edit-portfolio/${req.user_id}/${req.id}`);
      return;
    }

    const run = async () => {
      setActionLoading(req.id);
      try {
        let payload: any = { admin_description: perCardNote ?? globalAdminNote ?? null };

        if (req.request_type === "Change Email") {
          const newEmail = window.prompt("Enter new email for user:", "");
          if (!newEmail) { setActionLoading(null); return; }
          payload.new_email = newEmail;
        } else if (req.request_type === "Change Phone") {
          const newPhone = window.prompt("Enter new phone for user:", "");
          if (!newPhone) { setActionLoading(null); return; }
          payload.new_phone = newPhone;
        } else if (req.request_type === "General Query") {
          // nothing extra required
        }

        const res = await fetch(`${API_BASE}/admin/service-requests/${req.id}/perform`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) {
          alert(json.error || "Failed to perform request");
        } else {
          // update local state: mark completed and attach admin_description + updated_at if returned
          setRequests((prev) =>
            prev.map((r) =>
              r.id === req.id ? { ...r, status: "completed", admin_description: payload.admin_description ?? r.admin_description } : r
            )
          );
          alert("Request completed.");
        }
      } catch (e) {
        console.error(e);
        alert("Network error");
      } finally {
        setActionLoading(null);
      }
    };
    run();
  };

  // Add note (inline) — PATCH /admin/service-requests/:id/add-note
  const addNote = async (id: number, note: string) => {
    if (!note) {
      alert("Note is empty");
      return;
    }
    setActionLoading(id);
    try {
      const res = await fetch(`${API_BASE}/admin/service-requests/${id}/add-note`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_description: note }),
      });
      const json = await res.json();
      if (res.ok) {
        setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, admin_description: note } : r)));
      } else {
        alert(json.error || "Failed to add note");
      }
    } catch (e) {
      console.error(e);
      alert("Network error");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Layout>
      <div className="p-8">
        <Logo className="w-44 mb-6 h-auto" />
        <h1 className="text-3xl font-bold mb-6">Admin - Service Requests</h1>

        <div className="mb-4">
          <textarea
            value={globalAdminNote}
            onChange={(e) => setGlobalAdminNote(e.target.value)}
            placeholder="Global admin note (applies to next action if used)"
            className="w-full border rounded p-2"
          />
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="space-y-4">
            {requests.length === 0 && <p>No requests.</p>}

            {requests.map((req) => (
              <RequestCard
                key={req.id}
                req={req}
                onPerform={(perCardNote) => handlePerform(req, perCardNote)}
                onUpdateStatus={(status, perCardNote) => updateStatus(req.id, status, perCardNote)}
                onDelete={() => deleteRequest(req.id)}
                onAddNote={(note) => addNote(req.id, note)}
                loading={actionLoading === req.id}
                globalAdminNote={globalAdminNote}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default AdminServiceRequests;

// ----------------------
// Subcomponent: RequestCard
// ----------------------
const RequestCard: React.FC<{
  req: AdminRequest;
  onPerform: (perCardNote?: string | null) => void;
  onUpdateStatus: (status: StatusType, perCardNote?: string | null) => void;
  onDelete: () => void;
  onAddNote: (note: string) => void;
  loading?: boolean;
  globalAdminNote?: string;
}> = ({ req, onPerform, onUpdateStatus, onDelete, onAddNote, loading, globalAdminNote }) => {
  const [localNote, setLocalNote] = useState<string>(req.admin_description ?? "");
  const [editingNote, setEditingNote] = useState<boolean>(false);

  return (
    <motion.div whileHover={{ scale: 1.01 }} className="bg-white rounded-xl p-6 shadow flex flex-col md:flex-row md:justify-between gap-4">
      <div className="flex-1">
        <div className="flex items-center gap-3 mb-2">
          <ClipboardList size={20} className="text-indigo-600" />
          <div>
            <div className="font-semibold text-lg">Request #{req.id}</div>
            <div className="text-sm text-gray-500">{new Date(req.created_at).toLocaleString()}</div>
            <div className="text-xs text-gray-400">{req.updated_at ? `Updated: ${new Date(req.updated_at).toLocaleString()}` : ""}</div>
          </div>
        </div>

        <div className="text-sm text-gray-700 space-y-1">
          <div className="flex items-center gap-2"><Mail size={14} /> {req.user_name}</div>
          <div className="flex items-center gap-2"><User size={14} /> Member: {req.member_name || "Self"}</div>
          <div><strong>Type:</strong> {req.request_type}</div>
          {req.description && <div className="mt-2 text-gray-600">{req.description}</div>}
          <div className="mt-2">
            <strong>Admin note:</strong>
            {req.admin_description ? (
              <div className="mt-1 text-sm text-gray-700">{req.admin_description}</div>
            ) : (
              <div className="mt-1 text-sm text-gray-400">—</div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-start md:items-end gap-2 w-full md:w-auto">
        <div className={`text-sm px-3 py-1 rounded-full ${req.status === "pending" ? "bg-yellow-50 text-yellow-700" : req.status === "completed" ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"} font-semibold`}>
          {req.status.toUpperCase()}
        </div>

        <div className="w-full md:w-auto flex flex-col gap-2 mt-2">
          <div className="flex gap-2">
            <button onClick={() => onPerform(localNote || globalAdminNote || null)} disabled={loading} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
              {req.request_type === "Portfolio Update" ? "Open Editor" : "Perform"}
            </button>

            <button onClick={() => onUpdateStatus("processing", localNote || globalAdminNote || null)} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Mark Processing</button>

            <button onClick={() => onUpdateStatus("completed", localNote || globalAdminNote || null)} className="px-4 py-2 bg-green-700 text-white rounded hover:bg-green-800">Mark Completed</button>

            <button onClick={() => onUpdateStatus("rejected", localNote || globalAdminNote || null)} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Reject</button>

            <button onClick={onDelete} className="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200">
              <Trash2 size={16} />
            </button>
          </div>

          {/* Inline admin note editor */}
          <div className="mt-2 w-full md:w-[420px]">
            {editingNote ? (
              <div className="space-y-2">
                <textarea className="w-full border rounded p-2" rows={3} value={localNote} onChange={(e) => setLocalNote(e.target.value)} />
                <div className="flex gap-2">
                  <button
                    onClick={() => { onAddNote(localNote); setEditingNote(false); }}
                    disabled={loading}
                    className="px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                  >
                    Save Note
                  </button>
                  <button onClick={() => { setLocalNote(req.admin_description ?? ""); setEditingNote(false); }} className="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="text-sm text-gray-600 truncate">{localNote || "No admin note"}</div>
                <button onClick={() => setEditingNote(true)} className="px-2 py-1 text-xs bg-indigo-50 text-indigo-700 rounded">Add / Edit Note</button>
              </div>
            )}
          </div>

        </div>
      </div>
    </motion.div>
  );
};
