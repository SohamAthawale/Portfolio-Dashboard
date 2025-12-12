// src/pages/AdminDashboard.tsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Layout } from "../components/Layout";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import Logo from "../components/logo";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:5000";

// ----------------------------
// Types
// ----------------------------
interface UserRow {
  user_id: number;
  email: string;
  phone?: string | null;
  created_at?: string | null;
}

interface PortfolioStats {
  total_portfolios: number;
  total_holdings: number;
  total_invested: number;
  total_valuation: number;
  per_user?: any[];
  per_member?: any[];
}

interface RequestStats {
  total: number;
  monthly: { month: string; count: number }[];
  status: Record<string, number>;
}

interface AdminStats {
  users: {
    total: number;
    list: UserRow[];
  };
  families: number;
  family_members: number;
  portfolio_stats: PortfolioStats;
  requests: RequestStats;
}

const formatCurrency = (v: number) =>
  "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const DEFAULT_MARGIN = { top: 20, right: 20, bottom: 20, left: 20 };

// ----------------------------
// Component
// ----------------------------
export const AdminDashboard: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${API_BASE}/admin/stats`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to fetch stats");
        const data = await res.json();
        if (!cancelled) setStats(data as AdminStats);
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadStats();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading)
    return (
      <Layout>
        <div className="p-8">Loading admin dashboard...</div>
      </Layout>
    );

  if (error)
    return (
      <Layout>
        <div className="p-8">
          <div className="bg-red-50 text-red-700 p-4 rounded-lg">
            <strong>Error:</strong> {error}
          </div>
        </div>
      </Layout>
    );

  const users = stats?.users?.list ?? [];
  const totalUsers = stats?.users?.total ?? 0;
  const portfolioStats = stats?.portfolio_stats ?? ({} as PortfolioStats);
  const requests = stats?.requests ?? { total: 0, monthly: [], status: {} };

  const monthlyRequests = requests.monthly ?? [];

  const statusPie = Object.entries(requests.status ?? {}).map(
    ([name, value]) => ({ name, value })
  );

  const perUserData =
    (portfolioStats.per_user ?? []).map((u: any) => ({
      user_id: u.user_id,
      portfolios: u.total_portfolios ?? 0,
      holdings: u.total_holdings ?? 0,
    })) ?? [];

  const perUserTop = [...perUserData]
    .sort((a, b) => (b.portfolios ?? 0) - (a.portfolios ?? 0))
    .slice(0, 10);

  const COLORS = [
    "#4F46E5",
    "#10B981",
    "#F43F5E",
    "#F59E0B",
    "#3B82F6",
    "#7C3AED",
    "#06B6D4",
  ];

  return (
    <Layout>
      <motion.div
        className="p-4 sm:p-8 space-y-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <Logo className="w-32 sm:w-44 h-auto" />
            <h1 className="text-2xl sm:text-3xl font-bold">Admin Dashboard</h1>
          </div>

          <div className="text-right">
            <div className="text-xs sm:text-sm text-gray-600">Total users</div>
            <div className="text-xl sm:text-2xl font-semibold">
              {totalUsers}
            </div>
          </div>
        </div>

        {/* STAT CARDS */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3 sm:gap-6">
        <StatCard title="Users" value={totalUsers} />
        <StatCard title="Families" value={stats?.families ?? 0} />
        <StatCard title="Family Members" value={stats?.family_members ?? 0} />
        <StatCard title="Total Portfolios" value={portfolioStats.total_portfolios ?? 0} />
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3 sm:gap-6">
        <StatCard title="Total Holdings" value={portfolioStats.total_holdings ?? 0} />
        <StatCard title="Total Invested" value={formatCurrency(portfolioStats.total_invested ?? 0)} />
        <StatCard title="Total Valuation" value={formatCurrency(portfolioStats.total_valuation ?? 0)} />
      </div>

        {/* CHARTS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Monthly Requests */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl shadow h-[360px] sm:h-[380px]">
            <h2 className="text-lg sm:text-xl font-semibold mb-4">
              Monthly Service Requests
            </h2>
            <ResponsiveContainer width="100%" height="85%">
              <BarChart data={monthlyRequests} margin={DEFAULT_MARGIN}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" angle={-20} textAnchor="end" interval={0} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#4F46E5" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Request Status */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl shadow h-[360px] sm:h-[380px]">
            <h2 className="text-lg sm:text-xl font-semibold mb-4">
              Service Request Status
            </h2>
            <ResponsiveContainer width="100%" height="85%">
              <PieChart>
                <Pie
                  data={statusPie.length ? statusPie : [{ name: "none", value: 1 }]}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={100}
                  innerRadius={40}
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {(statusPie.length ? statusPie : [{ name: "none", value: 1 }]).map(
                    (_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    )
                  )}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Top Users */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl shadow h-[360px] sm:h-[380px]">
            <h2 className="text-lg sm:text-xl font-semibold mb-4">
              Top Users by Portfolios
            </h2>
            <ResponsiveContainer width="100%" height="85%">
              <BarChart data={perUserTop} margin={{ top: 20, right: 20, bottom: 70, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="user_id" angle={-30} textAnchor="end" interval={0} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="portfolios" fill="#10B981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* USERS TABLE */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl shadow">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg sm:text-xl font-semibold">Users</h2>
            <div className="text-xs sm:text-sm text-gray-500">{users.length} rows</div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="text-gray-600 border-b">
                  <th className="py-2 px-3">User ID</th>
                  <th className="py-2 px-3">Email</th>
                  <th className="py-2 px-3">Phone</th>
                  <th className="py-2 px-3">Created</th>
                  <th className="py-2 px-3">Actions</th>
                </tr>
              </thead>

              <tbody>
                {users.map((u) => (
                  <tr key={u.user_id} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-3">{u.user_id}</td>
                    <td className="py-2 px-3 break-all">{u.email}</td>
                    <td className="py-2 px-3">{u.phone ?? "—"}</td>
                    <td className="py-2 px-3">
                      {u.created_at ? new Date(u.created_at).toLocaleString() : "—"}
                    </td>
                    <td className="py-2 px-3">
                      <Link
                        to={`/admin/user/${u.user_id}`}
                        className="text-indigo-600 hover:underline text-xs sm:text-sm"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}

                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-gray-500">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    </Layout>
  );
};

// ----------------------------
// Stat Card
// ----------------------------
interface StatCardProps {
  title: string;
  value: string | number;
}

const StatCard: React.FC<StatCardProps> = ({ title, value }) => {
  return (
    <div
      className="
        p-4 sm:p-5 rounded-xl shadow-md bg-white 
        flex flex-col justify-center 
        min-w-[120px]   /* prevents shrinking too much */
        max-w-full
      "
    >
      {/* Title */}
      <div
        className="
          text-xs sm:text-sm font-medium text-gray-600 
          truncate whitespace-nowrap
        "
      >
        {title}
      </div>

      {/* Value */}
      <div
        className="
          text-lg sm:text-xl font-bold text-gray-900 
          truncate
        "
      >
        {value}
      </div>
    </div>
  );
};

export default AdminDashboard;
