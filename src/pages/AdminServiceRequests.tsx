import React, { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { CheckCircle, XCircle, Loader2, Trash2 } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:5000";

interface AdminRequest {
  id: number;
  request_id: number;
  user_name?: string;
  request_type: string;
  description?: string | null;
  status: string;
  created_at: string;
}

export const AdminServiceRequests: React.FC = () => {
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  // -----------------------------------------
  // LOAD REQUESTS
  // -----------------------------------------
  const loadRequests = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/service-requests`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setRequests(data);
      }
    } catch (err) {
      console.error("Error fetching admin requests:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadRequests();
  }, []);

  // -----------------------------------------
  // UPDATE STATUS (Approve / Complete / Reject)
  // -----------------------------------------
  const updateStatus = async (id: number, status: string) => {
    const res = await fetch(`${API_BASE}/admin/service-requests/${id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (res.ok) {
      loadRequests();
    }
  };

  // -----------------------------------------
  // DELETE REQUEST
  // -----------------------------------------
  const deleteRequest = async (id: number) => {
    if (!confirm("Are you sure you want to delete this request?")) return;

    const res = await fetch(`${API_BASE}/admin/service-requests/${id}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (res.ok) {
      setRequests((prev) => prev.filter((r) => r.id !== id));
    }
  };

  // -----------------------------------------
  // FILTER LOGIC
  // -----------------------------------------
  const filteredRequests =
    filter === "all"
      ? requests
      : requests.filter((r) => r.status.toLowerCase() === filter);

  return (
    <Layout>
      <div className="p-6 space-y-6">
        
        {/* Title */}
        <h1 className="text-3xl font-bold text-gray-800">Manage Service Requests</h1>

        {/* Filter Tabs */}
        <div className="flex gap-3">
          {["all", "pending", "processing", "completed", "rejected"].map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
                filter === tab
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-100"
              }`}
            >
              {tab.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow p-6">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 size={32} className="animate-spin text-gray-600" />
            </div>
          ) : filteredRequests.length === 0 ? (
            <p className="text-gray-500">No service requests found.</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="p-3">#</th>
                  <th className="p-3">User</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Description</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Created</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredRequests.map((req) => (
                  <tr key={req.id} className="border-b">
                    <td className="p-3">{req.request_id}</td>
                    <td className="p-3">{req.user_name || "Unknown"}</td>
                    <td className="p-3">{req.request_type}</td>
                    <td className="p-3">{req.description || "—"}</td>
                    <td className="p-3 font-semibold">{req.status}</td>
                    <td className="p-3">
                      {new Date(req.created_at).toLocaleString()}
                    </td>

                    <td className="p-3 text-right flex items-center justify-end gap-2">

                      {/* Approve */}
                      <button
                        onClick={() => updateStatus(req.id, "processing")}
                        className="text-blue-600 hover:text-blue-800"
                        title="Mark as Processing"
                      >
                        <Loader2 size={20} />
                      </button>

                      {/* Complete */}
                      <button
                        onClick={() => updateStatus(req.id, "completed")}
                        className="text-green-600 hover:text-green-800"
                        title="Mark as Completed"
                      >
                        <CheckCircle size={20} />
                      </button>

                      {/* Reject */}
                      <button
                        onClick={() => updateStatus(req.id, "rejected")}
                        className="text-red-600 hover:text-red-800"
                        title="Reject Request"
                      >
                        <XCircle size={20} />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => deleteRequest(req.id)}
                        className="text-gray-500 hover:text-gray-800"
                        title="Delete"
                      >
                        <Trash2 size={20} />
                      </button>

                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </Layout>
  );
};
