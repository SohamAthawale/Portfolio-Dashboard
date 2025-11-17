// AdminDashboard.tsx
import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:5000";

export const AdminDashboard = () => {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/service-requests`, { credentials: "include" });
        const data = await res.json();
        if (res.ok) setRequests(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const types = ["Change Email", "Change Phone", "Portfolio Update", "General Query"];
  const statsFor = (t: string) => {
    const filtered = requests.filter((r) => r.request_type === t);
    return {
      total: filtered.length,
      pending: filtered.filter((r) => r.status === "pending").length,
      completed: filtered.filter((r) => r.status === "completed").length,
    };
  };

  return (
    <Layout>
      <motion.div className="p-8 space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {types.map((t) => {
              const s = statsFor(t);
              return (
                <motion.div
                  key={t}
                  whileHover={{ scale: 1.03 }}
                  className="bg-white p-6 rounded-2xl shadow cursor-pointer"
                  onClick={() => navigate(`/admin/service-requests?type=${encodeURIComponent(t)}`)}
                >
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold">{t}</h3>
                    <div className="text-sm text-gray-500">{s.total} total</div>
                  </div>
                  <div className="mt-3 flex justify-between text-sm">
                    <div className="text-yellow-600">Pending: {s.pending}</div>
                    <div className="text-green-600">Completed: {s.completed}</div>
                  </div>
                </motion.div>
              );
            })}

            <motion.div className="bg-white p-6 rounded-2xl shadow">
              <div className="flex justify-between">
                <h3 className="font-semibold">All Requests</h3>
                <div className="text-sm text-gray-500">{requests.length}</div>
              </div>
            </motion.div>
          </div>
        )}
      </motion.div>
    </Layout>
  );
};
