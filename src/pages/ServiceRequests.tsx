import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { Plus } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:5000";

interface ServiceRequest {
  id: number;
  request_id: number;
  request_type: string;
  description?: string | null;
  status: string;
  created_at: string;
}

interface Member {
  member_id: number;
  name: string;
}

export const ServiceRequests = () => {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [requestType, setRequestType] = useState("");
  const [description, setDescription] = useState("");
  const [memberId, setMemberId] = useState<string>("self");

  // -----------------------------------
  // LOAD FAMILY MEMBERS
  // -----------------------------------
  const loadMembers = async () => {
    try {
      const res = await fetch(`${API_BASE}/family/members`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setMembers(data);
      }
    } catch (err) {
      console.error("Failed to load members", err);
    }
  };

  // -----------------------------------
  // LOAD USER REQUESTS
  // -----------------------------------
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
    loadMembers();
    loadRequests();
  }, []);

  // -----------------------------------
  // SUBMIT SERVICE REQUEST
  // -----------------------------------
  const submitRequest = async () => {
    if (!requestType) return alert("Request type is required");

    const payload = {
      request_type: requestType,
      description,
      member_id: memberId === "self" ? null : Number(memberId),
    };

    const res = await fetch(`${API_BASE}/service-requests`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setRequestType("");
      setDescription("");
      setMemberId("self");
      loadRequests();
    } else {
      alert("Failed to submit request");
    }
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">

        {/* PAGE TITLE */}
        <h1 className="text-3xl font-bold text-gray-800">My Service Requests</h1>

        {/* CREATE NEW REQUEST */}
        <div className="bg-white shadow rounded-xl p-6 space-y-4">
          <h2 className="text-xl font-semibold">Create New Request</h2>

          {/* Member Selector */}
          <select
            className="border p-2 rounded-md w-full"
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
          >
            <option value="self">Self</option>
            {members.map((m) => (
              <option key={m.member_id} value={m.member_id}>
                {m.name}
              </option>
            ))}
          </select>

          {/* Request Type */}
          <select
            className="border p-2 rounded-md w-full"
            value={requestType}
            onChange={(e) => setRequestType(e.target.value)}
          >
            <option value="">Select Request Type</option>
            <option value="Change Email">Change Email</option>
            <option value="Change Phone">Change Phone</option>
            <option value="Portfolio Update">Portfolio Update</option>
            <option value="General Query">General Query</option>
          </select>

          {/* Description */}
          <textarea
            className="border p-2 rounded-md w-full"
            rows={3}
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          {/* Submit */}
          <button
            onClick={submitRequest}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg inline-flex items-center gap-2 hover:bg-blue-700"
          >
            <Plus size={18} />
            Submit Request
          </button>
        </div>

        {/* PREVIOUS REQUESTS */}
        <div className="bg-white shadow rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Previous Requests</h2>

          {requests.length === 0 ? (
            <p className="text-gray-500">No service requests found.</p>
          ) : (
            <table className="w-full text-sm border-collapse table-fixed">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2 w-12">#</th>
                  <th className="p-2 w-40">Type</th>
                  <th className="p-2">Description</th>
                  <th className="p-2 w-32">Status</th>
                  <th className="p-2 w-48">Created</th>
                </tr>
              </thead>

              <tbody>
                {requests.map((req) => (
                  <tr key={req.id} className="border-b">
                    <td className="p-2">{req.request_id}</td>
                    <td className="p-2">{req.request_type}</td>
                    <td className="p-2">{req.description || "—"}</td>
                    <td className="p-2 capitalize">{req.status}</td>
                    <td className="p-2">
                      {new Date(req.created_at).toLocaleString()}
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
