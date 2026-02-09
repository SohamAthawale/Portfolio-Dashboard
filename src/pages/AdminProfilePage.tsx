import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ClipboardList, CheckCircle, Clock, XCircle, Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const API_BASE = import.meta.env.VITE_API_URL || '/pmsreports';

interface ServiceRequest {
  id: number;
  request_type: string;
  status: string;
  description: string;
  created_at: string;
  user_name: string;
  member_name: string;
}

export const AdminProfilePage = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role !== 'admin') {
      setLoading(false);
      return;
    }

    const loadRequests = async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/service-requests`, {
          credentials: "include",
        });

        const data = await res.json();
        if (res.ok) {
          setRequests(Array.isArray(data) ? data : []);
        } else {
          console.error("Error fetching admin requests:", data);
        }
      } catch (error) {
        console.error("❌ Error:", error);
      } finally {
        setLoading(false);
      }
    };

    loadRequests();
  }, [user?.role]);

  // 🚫 Non-admins cannot view this page
  if (user?.role !== "admin") {
    return <Navigate to="/pmsreports/profile" replace />;
  }

  // ---- Counts ----
  const total = requests.length;
  const completed = requests.filter((r) => r.status === "completed").length;
  const pending = requests.filter((r) => r.status === "pending").length;
  const processing = requests.filter((r) => r.status === "processing").length;
  const rejected = requests.filter((r) => r.status === "rejected").length;

  return (
    <Layout>
      <div className="space-y-8">
        <h1 className="app-title">Admin Overview</h1>

        {/* ADMIN INFO */}
        <div className="app-panel p-6">
          <p className="text-lg font-medium text-slate-800 mb-2">{user?.email}</p>
          <p className="text-slate-600">Administrative service queue and status summary.</p>
        </div>

        {/* SUMMARY CARDS */}
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 size={30} className="animate-spin text-gray-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-10">
            <motion.div whileHover={{ scale: 1.05 }} className="app-panel-soft p-5 flex items-center gap-3">
              <ClipboardList size={32} className="text-cyan-700" />
              <div>
                <p className="text-slate-600 text-sm">Total Requests</p>
                <p className="text-xl font-semibold">{total}</p>
              </div>
            </motion.div>

            <motion.div whileHover={{ scale: 1.05 }} className="app-panel-soft p-5 flex items-center gap-3">
              <Clock size={32} className="text-yellow-500" />
              <div>
                <p className="text-slate-600 text-sm">Pending</p>
                <p className="text-xl font-semibold">{pending}</p>
              </div>
            </motion.div>

            <motion.div whileHover={{ scale: 1.05 }} className="app-panel-soft p-5 flex items-center gap-3">
              <Loader2 size={32} className="text-purple-500" />
              <div>
                <p className="text-slate-600 text-sm">Processing</p>
                <p className="text-xl font-semibold">{processing}</p>
              </div>
            </motion.div>

            <motion.div whileHover={{ scale: 1.05 }} className="app-panel-soft p-5 flex items-center gap-3">
              <CheckCircle size={32} className="text-green-600" />
              <div>
                <p className="text-slate-600 text-sm">Completed</p>
                <p className="text-xl font-semibold">{completed}</p>
              </div>
            </motion.div>

            <motion.div whileHover={{ scale: 1.05 }} className="app-panel-soft p-5 flex items-center gap-3">
              <XCircle size={32} className="text-red-500" />
              <div>
                <p className="text-slate-600 text-sm">Rejected</p>
                <p className="text-xl font-semibold">{rejected}</p>
              </div>
            </motion.div>
          </div>
        )}

        {/* LIST OF REQUESTS */}
        <div className="app-panel p-6">
          <h2 className="text-lg font-semibold mb-4">All Service Requests</h2>

          {requests.length === 0 ? (
            <p className="text-gray-500">No requests found.</p>
          ) : (
            <div className="space-y-4">
              {requests.map((req) => (
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  key={req.id}
                  className="border rounded-lg p-4 flex flex-col gap-2"
                >
                  <p className="font-medium text-gray-800">
                    {req.request_type} — <span className="text-sm text-gray-600">{req.status}</span>
                  </p>
                  <p className="text-sm text-gray-600">
                    <strong>User: </strong> {req.user_name}
                  </p>
                  <p className="text-sm text-gray-600">
                    <strong>For:</strong> {req.member_name}
                  </p>
                  {req.description && (
                    <p className="text-sm text-gray-600">
                      <strong>Description:</strong> {req.description}
                    </p>
                  )}
                  <p className="text-xs text-gray-400">
                    {new Date(req.created_at).toLocaleString()}
                  </p>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};
