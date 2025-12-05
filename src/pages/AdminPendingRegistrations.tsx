import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { motion } from "framer-motion";
import Logo from "../components/logo";
import { Mail, Phone, UserCheck} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:5000";

// -----------------------------
// TYPES
// -----------------------------
interface PendingUser {
  id: number;
  email: string;
  phone: string;
}

interface ApprovedUser {
  user_id: number;
  email: string;
  phone: string;
  created_at: string;
}

export default function AdminPendingRegistrations() {
  const [pending, setPending] = useState<PendingUser[]>([]);
  const [approved, setApproved] = useState<ApprovedUser[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const pRes = await fetch(`${API_BASE}/admin/pending-registrations`, { credentials: "include" });
      const aRes = await fetch(`${API_BASE}/admin/approved-accounts`, { credentials: "include" });

      setPending(await pRes.json());
      setApproved(await aRes.json());
    } catch (err) {
      console.error("Fetch error:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const approve = async (id: number) => {
    await fetch(`${API_BASE}/admin/approve-registration/${id}`, {
      method: "POST",
      credentials: "include",
    });
    fetchData();
  };

  const reject = async (id: number) => {
    await fetch(`${API_BASE}/admin/reject-registration/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    fetchData();
  };

  if (loading) return <Layout><div className="p-8">Loading...</div></Layout>;

  return (
    <Layout>
      <div className="p-8">
        <Logo className="w-44 mb-6 h-auto" />
        <h1 className="text-3xl font-bold mb-8">Admin – User Registrations</h1>

        {/* -------------------- PENDING REGISTRATIONS -------------------- */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Pending Registrations</h2>

          {pending.length === 0 ? (
            <p className="text-gray-500">No pending registrations.</p>
          ) : (
            <div className="space-y-4">
              {pending.map((p) => (
                <PendingCard key={p.id} user={p} onApprove={approve} onReject={reject} />
              ))}
            </div>
          )}
        </section>

        {/* -------------------- APPROVED ACCOUNTS -------------------- */}
        <section>
          <h2 className="text-2xl font-bold mb-4">Approved Accounts</h2>

          {approved.length === 0 ? (
            <p className="text-gray-500">No approved accounts.</p>
          ) : (
            <div className="space-y-4">
              {approved.map((a) => (
                <ApprovedCard key={a.user_id} user={a} />
              ))}
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}

// =======================================================================
// COMPONENT: Pending Registration Card (matches service request UI)
// =======================================================================
const PendingCard = ({
  user,
  onApprove,
  onReject,
}: {
  user: PendingUser;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
}) => {
  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      className="bg-white rounded-xl p-6 shadow flex flex-col md:flex-row md:justify-between gap-4"
    >
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-3 mb-1">
          <UserCheck size={20} className="text-indigo-600" />
          <div className="font-semibold text-lg">User #{user.id}</div>
        </div>

        <div className="text-sm text-gray-700 space-y-1">
          <div className="flex items-center gap-2"><Mail size={14} /> {user.email}</div>
          <div className="flex items-center gap-2"><Phone size={14} /> {user.phone}</div>
        </div>
      </div>

      {/* ACTIONS */}
      <div className="flex flex-col items-start md:items-end gap-2 w-full md:w-auto">
        <div className="flex gap-2">
          <button
            onClick={() => onApprove(user.id)}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Approve
          </button>

          <button
            onClick={() => onReject(user.id)}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Reject
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// =======================================================================
// COMPONENT: Approved User Card
// =======================================================================
const ApprovedCard = ({ user }: { user: ApprovedUser }) => {
  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      className="bg-green-50 border border-green-200 rounded-xl p-6 shadow flex flex-col md:flex-row md:justify-between gap-4"
    >
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-3 mb-1">
          <UserCheck size={20} className="text-green-700" />
          <div className="font-semibold text-lg">User #{user.user_id} (Approved)</div>
        </div>

        <div className="text-sm text-gray-700 space-y-1">
          <div className="flex items-center gap-2"><Mail size={14} /> {user.email}</div>
          <div className="flex items-center gap-2"><Phone size={14} /> {user.phone}</div>
          <div className="text-xs text-gray-500">Created: {new Date(user.created_at).toLocaleString()}</div>
        </div>
      </div>
    </motion.div>
  );
};
