// src/pages/AdminServiceRequests.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { motion } from "framer-motion";
import { ClipboardList, Trash2, Mail, User } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:5000";

interface AdminRequest {
  id: number;
  user_id: number;
  member_id?: number | null;
  request_type: string;
  description?: string;
  status: "pending" | "processing" | "completed" | "rejected";
  created_at: string;
  user_name: string;
  member_name?: string;
  admin_description?: string;
}

export const AdminServiceRequests: React.FC = () => {
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [adminNote, setAdminNote] = useState<string>("");

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

  const updateStatus = async (id: number, status: AdminRequest["status"]) => {
    setActionLoading(id);
    try {
      const res = await fetch(`${API_BASE}/admin/service-requests/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, admin_description: adminNote || null }),
      });
      const json = await res.json();
      if (res.ok) {
        setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status, admin_description: adminNote } : r)));
        setAdminNote("");
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

  const handlePerform = (req: AdminRequest) => {
    // If Portfolio Update -> open full page editor
    if (req.request_type === "Portfolio Update") {
      // navigate to the editor page with userId and requestId
      navigate(`/admin/edit-portfolio/${req.user_id}/${req.id}`);
      return;
    }

    // For other request types, open prompt flows or call perform endpoint directly:
    const run = async () => {
      setActionLoading(req.id);
      try {
        let payload: any = { admin_description: adminNote || null };
        if (req.request_type === "Change Email") {
          const newEmail = window.prompt("Enter new email for user:", "");
          if (!newEmail) { setActionLoading(null); return; }
          payload.new_email = newEmail;
        } else if (req.request_type === "Change Phone") {
          const newPhone = window.prompt("Enter new phone for user:", "");
          if (!newPhone) { setActionLoading(null); return; }
          payload.new_phone = newPhone;
        } else if (req.request_type === "General Query") {
          // just add admin description
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
          // update local state
          setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status: "completed", admin_description: payload.admin_description } : r)));
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

  return (
    <Layout>
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Admin - Service Requests</h1>

        <div className="mb-4">
          <textarea
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            placeholder="Global admin note (applies to next action)"
            className="w-full border rounded p-2"
          />
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="space-y-4">
            {requests.length === 0 && <p>No requests.</p>}

            {requests.map((req) => (
              <motion.div key={req.id} whileHover={{ scale: 1.01 }} className="bg-white rounded-xl p-6 shadow flex flex-col md:flex-row md:justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <ClipboardList size={20} className="text-indigo-600" />
                    <div>
                      <div className="font-semibold text-lg">Request #{req.id}</div>
                      <div className="text-sm text-gray-500">{new Date(req.created_at).toLocaleString()}</div>
                    </div>
                  </div>

                  <div className="text-sm text-gray-700 space-y-1">
                    <div className="flex items-center gap-2"><Mail size={14} /> {req.user_name}</div>
                    <div className="flex items-center gap-2"><User size={14} /> Member: {req.member_name}</div>
                    <div><strong>Type:</strong> {req.request_type}</div>
                    {req.description && <div className="mt-2 text-gray-600">{req.description}</div>}
                    {req.admin_description && <div className="mt-1 text-xs text-gray-400">Admin note: {req.admin_description}</div>}
                  </div>
                </div>

                <div className="flex flex-col items-start md:items-end gap-2">
                  <div className="text-sm px-3 py-1 rounded-full bg-yellow-50 text-yellow-700 font-semibold">{req.status.toUpperCase()}</div>

                  <div className="flex gap-2 mt-2">
                    <button onClick={() => handlePerform(req)} disabled={actionLoading === req.id} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
                      {req.request_type === "Portfolio Update" ? "Open Editor" : "Perform"}
                    </button>

                    <button onClick={() => updateStatus(req.id, "processing")} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Mark Processing</button>

                    <button onClick={() => updateStatus(req.id, "completed")} className="px-4 py-2 bg-green-700 text-white rounded hover:bg-green-800">Mark Completed</button>

                    <button onClick={() => updateStatus(req.id, "rejected")} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Reject</button>

                    <button onClick={() => deleteRequest(req.id)} className="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};
