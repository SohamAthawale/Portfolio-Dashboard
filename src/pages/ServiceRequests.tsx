import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { Plus, Trash2 } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:5000";

interface ServiceRequest {
  id: number;
  request_id: number;
  request_type: string;
  description?: string | null;
  status: string;
  created_at: string;
}

export const ServiceRequests = () => {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [requestType, setRequestType] = useState("");
  const [description, setDescription] = useState("");

  const loadRequests = async () => {
    try {
      const res = await fetch(`${API_BASE}/service-requests`, {
        credentials: "include",
      });
      if (res.ok) setRequests(await res.json());
    } catch (err) {
      console.error("Failed to load requests", err);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const submitRequest = async () => {
    if (!requestType) return alert("Request type is required");

    const body = {
      request_type: requestType,
      description,
    };

    const res = await fetch(`${API_BASE}/service-requests`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      setRequestType("");
      setDescription("");
      loadRequests();
    }
  };

  const deleteRequest = async (id: number) => {
    const res = await fetch(`${API_BASE}/service-requests/${id}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (res.ok) {
      setRequests((prev) => prev.filter((r) => r.id !== id));
    }
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">

        <h1 className="text-3xl font-bold text-gray-800">
          My Service Requests
        </h1>

        {/* Create New Request */}
        <div className="bg-white shadow rounded-xl p-6 space-y-4">

          <h2 className="text-xl font-semibold">Create New Request</h2>

          <select
            className="border p-2 rounded-md w-full"
            value={requestType}
            onChange={(e) => setRequestType(e.target.value)}
          >
            <option value="">Select Request Type</option>
            <option value="PAN Update">PAN Update</option>
            <option value="Change Email">Change Email</option>
            <option value="Change Phone">Change Phone</option>
            <option value="Nominee Update">Nominee Update</option>
            <option value="General Query">General Query</option>
          </select>

          <textarea
            className="border p-2 rounded-md w-full"
            rows={3}
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <button
            onClick={submitRequest}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg inline-flex items-center gap-2 hover:bg-blue-700"
          >
            <Plus size={18} />
            Submit Request
          </button>

        </div>

        {/* Existing Requests */}
        <div className="bg-white shadow rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Previous Requests</h2>

          {requests.length === 0 ? (
            <p className="text-gray-500">No service requests found.</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="p-2">#</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Description</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Created</th>
                  <th className="p-2 text-right">Actions</th>
                </tr>
              </thead>

              <tbody>
                {requests.map((req) => (
                  <tr key={req.id} className="border-b">
                    <td className="p-2">{req.request_id}</td>
                    <td className="p-2">{req.request_type}</td>
                    <td className="p-2">{req.description || "—"}</td>
                    <td className="p-2">{req.status}</td>
                    <td className="p-2">
                      {new Date(req.created_at).toLocaleString()}
                    </td>
                    <td className="p-2 text-right">
                      <button
                        onClick={() => deleteRequest(req.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 size={18} />
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
